import { TIMETABLE_SHEET_ID, TIMETABLE_SHEET_TABS, timetableCsvUrl } from '../timetableSheetConfig';
import type { TimetableSheetTab } from '../timetableSheetConfig';
import { parseCsvToGrid } from '../../utils/csv';
import type { TimetableClassEntry } from '../timetable';
import {
  TimetableCellWrite,
  TimetableWritePlan,
  RemoteTimetableSnapshot,
  RemoteGrids,
  TimetableTabResult,
  TimetableApplyResult,
  ApplyTimetableWritesOptions,
  SyncTimetableOptions,
  SyncTimetableReport,
} from './types';
import { groupWritesIntoRanges, verifyTabAgainstGuard } from './batchGrouping';
import { planTimetableWrites } from './diffPlanner';

const SHEETS_VALUES_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return '';
  }
}

async function classifyWriteError(message: string): Promise<{ kind: string; message: string }> {
  try {
    const { classifySheetsWriteError } = await import('../googleSheetsService');
    return classifySheetsWriteError(message);
  } catch {
    return { kind: 'unknown', message };
  }
}

export async function applyTimetableWrites(
  plan: TimetableWritePlan,
  accessToken: string,
  options: ApplyTimetableWritesOptions = {}
): Promise<TimetableApplyResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const result: TimetableApplyResult = {
    ok: true,
    needsReconnect: false,
    tabsWritten: [],
    cellsWritten: 0,
    skipped: [...(plan?.skippedTabs ?? [])],
    errors: [],
    perTab: [],
  };

  if (!accessToken) {
    return { ...result, ok: false, needsReconnect: true };
  }
  if (!plan) {
    return { ...result, ok: false, errors: [{ tabName: '(none)', range: '', message: 'No plan was supplied.' }] };
  }

  const allWrites = [...(plan.writes ?? []), ...(plan.timeWrites ?? [])];
  if (allWrites.length === 0) {
    return result;
  }

  const classLabelByTab = new Map<string, string>();
  for (const write of allWrites) if (!classLabelByTab.has(write.tabName)) classLabelByTab.set(write.tabName, write.classLabel);

  const writesByTab = new Map<string, TimetableCellWrite[]>();
  for (const write of allWrites) {
    const list = writesByTab.get(write.tabName) ?? [];
    list.push(write);
    writesByTab.set(write.tabName, list);
  }

  let haltForReconnect = false;

  for (const [tabName, writes] of writesByTab) {
    if (haltForReconnect) break;
    const classLabel = classLabelByTab.get(tabName) ?? tabName;
    const guardProblem = verifyTabAgainstGuard(tabName, writes, plan.guards?.[tabName]);
    if (guardProblem) {
      const message = `Tab "${tabName}" rejected before writing: ${guardProblem}`;
      result.ok = false;
      result.errors.push({ tabName, range: '', message });
      result.perTab.push({ tabName, classLabel, ok: false, cellsWritten: 0, ranges: [], error: message });
      continue;
    }

    const tabResult: TimetableTabResult = { tabName, classLabel, ok: true, cellsWritten: 0, ranges: [] };
    const ranges = groupWritesIntoRanges(writes);

    const reportFailure = async (rangeLabel: string, raw: string) => {
      const message = `Sheet write failed for ${rangeLabel}: ${raw}`;
      const classified = await classifyWriteError(message);
      const shown = classified.kind === 'unknown' ? message : classified.message;
      tabResult.ok = false;
      tabResult.error = shown;
      result.ok = false;
      result.errors.push({ tabName, range: rangeLabel, message: shown });
      return classified.kind;
    };

    for (const range of ranges) {
      const url = `${SHEETS_VALUES_BASE}/${TIMETABLE_SHEET_ID}/values/${encodeURIComponent(range.range)}?valueInputOption=RAW`;
      try {
        const response = await doFetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ range: range.range, majorDimension: 'ROWS', values: range.values }),
        });
        if (!response.ok) {
          const text = await safeText(response);
          const kind = await reportFailure(
            range.range,
            `HTTP ${response.status}${text ? `: ${text}` : ''}`,
          );
          if (kind === 'auth' || kind === 'scope') {
            result.needsReconnect = true;
            haltForReconnect = true;
            break;
          }
          continue;
        }
        tabResult.ranges.push(range.range);
        tabResult.cellsWritten += range.cells;
      } catch (err) {
        await reportFailure(range.range, (err as Error)?.message ?? String(err));
      }
    }
    if (tabResult.ok && tabResult.cellsWritten > 0) {
      result.tabsWritten.push(tabName);
      result.cellsWritten += tabResult.cellsWritten;
    }
    result.perTab.push(tabResult);
  }

  return result;
}

export async function fetchTimetableGrids(
  tabs: TimetableSheetTab[] = TIMETABLE_SHEET_TABS,
  options: { fetchImpl?: typeof fetch; cacheBust?: boolean } = {}
): Promise<RemoteTimetableSnapshot> {
  const doFetch = options.fetchImpl ?? fetch;
  const grids: RemoteGrids = {};
  const errors: string[] = [];
  for (const tab of tabs) {
    const url = options.cacheBust === false ? timetableCsvUrl(tab.gid) : `${timetableCsvUrl(tab.gid)}&_=${Date.now()}`;
    try {
      const response = await doFetch(url, { redirect: 'follow' });
      if (!response.ok) {
        errors.push(`${tab.name}: HTTP ${response.status}`);
        continue;
      }
      grids[tab.name] = parseCsvToGrid(await response.text());
    } catch (err) {
      errors.push(`${tab.name}: ${(err as Error)?.message ?? String(err)}`);
    }
  }
  return { grids, readAt: Date.now(), ...(errors.length ? { errors } : {}) } as RemoteTimetableSnapshot;
}

export async function syncTimetableToSheet(
  classes: TimetableClassEntry[],
  options: SyncTimetableOptions = {}
): Promise<SyncTimetableReport> {
  const dryRun = options.dryRun !== false;
  const doFetch = options.fetchImpl ?? fetch;
  const tabs = TIMETABLE_SHEET_TABS.filter((tab) => !options.tabNames || options.tabNames.includes(tab.name));

  const remote = await fetchTimetableGrids(tabs, { fetchImpl: doFetch, cacheBust: options.cacheBust });
  const plan = planTimetableWrites(classes, remote, options);
  const readErrors = ((remote as unknown as { errors?: string[] }).errors ?? []).map((message) => ({
    tabName: '(read)',
    range: '',
    message,
  }));

  const base: SyncTimetableReport = {
    ok: readErrors.length === 0,
    dryRun,
    needsReconnect: false,
    tabsWritten: [],
    cellsWritten: 0,
    unchangedTabs: plan.unchangedTabs,
    skipped: plan.skippedTabs,
    errors: readErrors,
    perTab: [],
    plan,
  };

  if (dryRun) {
    return base;
  }

  let token = options.accessToken ?? null;
  if (!token) {
    const { getAccessToken, isGoogleTokenExpired } = await import('../googleAuth');
    if (isGoogleTokenExpired()) {
      return { ...base, ok: false, needsReconnect: true };
    }
    token = await getAccessToken();
  }
  if (!token) {
    return { ...base, ok: false, needsReconnect: true };
  }

  const applied = await applyTimetableWrites(plan, token, { fetchImpl: doFetch });
  return {
    ok: applied.ok,
    dryRun: false,
    needsReconnect: applied.needsReconnect,
    tabsWritten: applied.tabsWritten,
    cellsWritten: applied.cellsWritten,
    unchangedTabs: plan.unchangedTabs,
    skipped: applied.skipped,
    errors: [...readErrors, ...applied.errors],
    perTab: applied.perTab,
    plan,
  };
}

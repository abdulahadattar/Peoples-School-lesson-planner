import { normalizeGrKey } from '../identityNormalization';
import { isHsscGrade } from './calculations';
import { getStoredMarksheetSpreadsheetId } from './config';
import type { MarksheetPendingEdit } from './pendingEditsRepository';
import { DEFAULT_RESULT_SHEET_COLS } from './resultSheetParser';
import type { MarksheetExamType, MarksheetGradeLevel, SubjectKey } from './types';

export interface MarksheetScoreSyncPayload {
  grNo: string;
  gradeLevel: MarksheetGradeLevel;
  examType: MarksheetExamType;
  subjectKey: SubjectKey;
  score: number;
}

function colIndexToA1(zeroBasedCol: number): string {
  let col = zeroBasedCol + 1;
  let out = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    col = Math.floor((col - 1) / 26);
  }
  return out;
}

async function fetchSheetTabTitles(spreadsheetId: string, accessToken: string): Promise<string[]> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    const errText = await metaRes.text().catch(() => '');
    throw new Error(`Sheets metadata error (${metaRes.status}): ${errText.slice(0, 120)}`);
  }

  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  return (meta.sheets || [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));
}

function prioritizeTabs(titles: string[], gradeHint?: string): string[] {
  const lowHint = (gradeHint || '').toLowerCase();
  return [...titles].sort((a, b) => {
    const scoreTitle = (t: string) => {
      const low = t.toLowerCase();
      if (lowHint && low.includes('result') && low.includes(lowHint)) return 0;
      if (low.includes('result')) return 1;
      if (lowHint && low.includes(lowHint)) return 2;
      return 3;
    };
    return scoreTitle(a) - scoreTitle(b);
  });
}

export async function syncMarksheetScoreToSheet(
  payload: MarksheetScoreSyncPayload,
  accessToken: string,
  spreadsheetIdOverride?: string
): Promise<void> {
  if (!accessToken) {
    throw new Error('Google sign-in token missing.');
  }

  const spreadsheetId = spreadsheetIdOverride || getStoredMarksheetSpreadsheetId();

  const colIdx = DEFAULT_RESULT_SHEET_COLS.subjects[payload.subjectKey]?.[payload.examType];
  if (colIdx === undefined) {
    throw new Error(`No spreadsheet column mapped for ${payload.subjectKey} (${payload.examType}).`);
  }

  const titles = await fetchSheetTabTitles(spreadsheetId, accessToken);
  const prioritized = prioritizeTabs(titles, payload.gradeLevel);

  const targetGrKey = normalizeGrKey(payload.grNo);
  let matchedTab: string | null = null;
  let matchedRow1Based = -1;

  for (const title of prioritized) {
    const safeRange = `'${title.replace(/'/g, "''")}'!B5:B600`;
    const valRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(safeRange)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!valRes.ok) continue;
    const valJson = (await valRes.json()) as { values?: string[][] };
    const rows = valJson.values || [];
    for (let i = 0; i < rows.length; i++) {
      const cellGr = normalizeGrKey(rows[i]?.[0]);
      if (cellGr && cellGr === targetGrKey) {
        matchedTab = title;
        matchedRow1Based = 5 + i;
        break;
      }
    }
    if (matchedTab) break;
  }

  if (!matchedTab || matchedRow1Based < 5) {
    throw new Error(`GR #${payload.grNo} was not found in Marksheet Result Sheet.`);
  }

  const colA1 = colIndexToA1(colIdx);
  const cellRange = `'${matchedTab.replace(/'/g, "''")}'!${colA1}${matchedRow1Based}`;
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      cellRange
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: cellRange,
        values: [[payload.score]],
      }),
    }
  );

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => '');
    throw new Error(`Failed writing score cell (${putRes.status}): ${errText.slice(0, 120)}`);
  }
}

export async function pushPendingMarksheetEditsToSheet(
  edits: MarksheetPendingEdit[],
  accessToken: string,
  spreadsheetIdOverride?: string
): Promise<{
  pushedDocIds: string[];
  missingGrs: string[];
  cellsUpdated: number;
}> {
  if (!accessToken) {
    throw new Error('Google sign-in token missing.');
  }
  if (!edits.length) {
    return { pushedDocIds: [], missingGrs: [], cellsUpdated: 0 };
  }

  const spreadsheetId = spreadsheetIdOverride || getStoredMarksheetSpreadsheetId();
  const titles = await fetchSheetTabTitles(spreadsheetId, accessToken);
  const prioritized = prioritizeTabs(titles);

  const neededGrKeys = new Set(edits.map((e) => normalizeGrKey(e.grNo)).filter(Boolean));
  const locationByGr = new Map<string, { tab: string; row1Based: number }>();

  for (const title of prioritized) {
    if (locationByGr.size >= neededGrKeys.size) break;
    const safeRange = `'${title.replace(/'/g, "''")}'!B5:B600`;
    const valRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(safeRange)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!valRes.ok) continue;
    const valJson = (await valRes.json()) as { values?: string[][] };
    const rows = valJson.values || [];
    for (let i = 0; i < rows.length; i++) {
      const cellGr = normalizeGrKey(rows[i]?.[0]);
      if (cellGr && neededGrKeys.has(cellGr) && !locationByGr.has(cellGr)) {
        locationByGr.set(cellGr, { tab: title, row1Based: 5 + i });
      }
    }
  }

  const valueRanges: Array<{ range: string; values: Array<Array<string | number>> }> = [];
  const pushedDocIds: string[] = [];
  const missingGrs: string[] = [];

  for (const edit of edits) {
    const loc = locationByGr.get(normalizeGrKey(edit.grNo));
    if (!loc) {
      missingGrs.push(edit.grNo);
      continue;
    }

    const tabQuoted = `'${loc.tab.replace(/'/g, "''")}'`;
    const cellValuesByCol = new Map<number, string | number>();

    for (const [rawKey, rawVal] of Object.entries(edit.scores || {})) {
      const subjectKey = rawKey as SubjectKey;
      const colIdx = DEFAULT_RESULT_SHEET_COLS.subjects[subjectKey]?.[edit.examType];
      if (colIdx === undefined) continue;
      cellValuesByCol.set(colIdx, rawVal === null || rawVal === undefined ? '' : rawVal);
    }

    if (edit.optionalLanguage === 'Sindhi') {
      const urduCol = DEFAULT_RESULT_SHEET_COLS.subjects.urdu[edit.examType];
      if (!cellValuesByCol.has(urduCol) && (edit.scores.urdu === null || edit.scores.urdu === undefined)) {
        cellValuesByCol.set(urduCol, '');
      }
    } else if (edit.optionalLanguage === 'Urdu') {
      const sindhiCol = DEFAULT_RESULT_SHEET_COLS.subjects.sindhi[edit.examType];
      if (!cellValuesByCol.has(sindhiCol) && (edit.scores.sindhi === null || edit.scores.sindhi === undefined)) {
        cellValuesByCol.set(sindhiCol, '');
      }
    }

    const hssc = isHsscGrade(edit.gradeLevel);
    if (edit.optionalElective === 'Biology') {
      const siblingCol = hssc
        ? DEFAULT_RESULT_SHEET_COLS.subjects.mathematics[edit.examType]
        : DEFAULT_RESULT_SHEET_COLS.subjects.ict[edit.examType];
      if (!cellValuesByCol.has(siblingCol)) {
        cellValuesByCol.set(siblingCol, '');
      }
    } else if (edit.optionalElective === 'ICT' || edit.optionalElective === 'Mathematics') {
      const bioCol = DEFAULT_RESULT_SHEET_COLS.subjects.biology[edit.examType];
      if (!cellValuesByCol.has(bioCol)) {
        cellValuesByCol.set(bioCol, '');
      }
    }

    cellValuesByCol.forEach((val, colIdx) => {
      valueRanges.push({
        range: `${tabQuoted}!${colIndexToA1(colIdx)}${loc.row1Based}`,
        values: [[val]],
      });
    });

    pushedDocIds.push(edit.docId);
  }

  if (valueRanges.length > 0) {
    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: valueRanges,
        }),
      }
    );

    if (!batchRes.ok) {
      const errText = await batchRes.text().catch(() => '');
      throw new Error(`Failed pushing teacher updates to Sheet (${batchRes.status}): ${errText.slice(0, 140)}`);
    }
  }

  return {
    pushedDocIds,
    missingGrs,
    cellsUpdated: valueRanges.length,
  };
}

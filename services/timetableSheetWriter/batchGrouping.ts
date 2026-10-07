import { TimetableCellWrite, TimetableCellRange, TimetableTabGuard } from './types';

export function escapeTabName(name: string): string {
  return String(name ?? '').replace(/'/g, "''");
}

export function groupWritesIntoRanges(writes: TimetableCellWrite[]): TimetableCellRange[] {
  const byTab = new Map<string, Map<number, TimetableCellWrite[]>>();
  for (const write of writes) {
    let rows = byTab.get(write.tabName);
    if (!rows) {
      rows = new Map<number, TimetableCellWrite[]>();
      byTab.set(write.tabName, rows);
    }
    const rowCells = rows.get(write.row1) ?? [];
    rowCells.push(write);
    rows.set(write.row1, rowCells);
  }

  const ranges: TimetableCellRange[] = [];
  for (const [tabName, rows] of byTab) {
    for (const row1 of [...rows.keys()].sort((a, b) => a - b)) {
      const cells = [...(rows.get(row1) ?? [])].sort((a, b) => a.col0 - b.col0);
      let run: TimetableCellWrite[] = [];
      const flush = () => {
        if (run.length === 0) return;
        const first = run[0];
        const last = run[run.length - 1];
        const start = first.a1.replace(/\d+$/, '');
        const range =
          run.length === 1 && start === last.a1.replace(/\d+$/, '')
            ? `'${escapeTabName(tabName)}'!${first.a1}`
            : `'${escapeTabName(tabName)}'!${start}${row1}:${last.a1.replace(/\d+$/, '')}${row1}`;
        ranges.push({ range, values: [run.map((c) => c.value)], cells: run.length });
        run = [];
      };
      for (const cell of cells) {
        if (run.length > 0 && cell.col0 !== run[run.length - 1].col0 + 1) flush();
        run.push(cell);
      }
      flush();
    }
  }
  return ranges;
}

export function verifyTabAgainstGuard(
  tabName: string,
  writes: TimetableCellWrite[],
  guard: TimetableTabGuard | undefined
): string | null {
  if (!guard) return `No safety envelope was recorded for tab "${tabName}"; refusing to write.`;
  const periodRows = new Set(guard.periodRows);
  const forbidden = new Set(guard.forbiddenRows);
  const dayCols = new Set(guard.dayColumns);
  const timeCols = new Set(guard.timeColumns);
  for (const write of writes) {
    if (!periodRows.has(write.row1)) return `${write.a1} is not a period row of the plan's layout.`;
    if (forbidden.has(write.row1)) return `${write.a1} is a protected row (title/header/break/ignored).`;
    if (write.day === 'time') {
      if (timeCols.size === 0) return `${write.a1} is a time cell but the plan was not opted into time writes.`;
      if (!timeCols.has(write.col0)) return `${write.a1} is not a writable time column of the plan's layout.`;
    } else if (!dayCols.has(write.col0)) {
      return `${write.a1} is not a detected day column of the plan's layout.`;
    }
  }
  return null;
}

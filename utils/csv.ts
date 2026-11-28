/**
 * Pure CSV parser utility for Google Sheets exports and tabular data.
 * Handles quoted cells, escaped quotes, embedded newlines, and BOM markers.
 */

export function parseCsvToGrid(text: string): string[][] {
  const raw = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let sawCell = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    sawCell = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    sawCell = false;
  };

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    let index = 0;
    while (index < line.length) {
      const ch = line[index];
      if (ch === '"') {
        if (inQuotes && line[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = !inQuotes;
        index += 1;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        endCell();
        index += 1;
        continue;
      }
      cell += ch;
      index += 1;
    }
    if (inQuotes) {
      cell += '\n';
      continue;
    }
    if (i < raw.length - 1 || line.length > 0) {
      endRow();
    }
  }
  if (cell.length > 0 || sawCell || row.length > 0) {
    endRow();
  }

  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length;
  return rows.map(r => {
    const padded = r.slice();
    while (padded.length < width) padded.push('');
    return padded;
  });
}

export function parseCSV(text: string): string[][] {
  const grid = parseCsvToGrid(text);
  return grid.map(r => r.map(c => c.trim()));
}

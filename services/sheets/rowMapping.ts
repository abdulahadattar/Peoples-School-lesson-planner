import { StudentRecord } from './types';

export const STUDENT_META_COLUMN_COUNT = 17;
export const FIRST_STUDENT_DATA_COLUMN = 'R';
export const LAST_STUDENT_DATA_COLUMN = 'AO';
export const EXPECTED_STUDENT_DATA_COLUMNS = 24;

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function rowToStudentRecord(row: string[], rowIndex: number): StudentRecord {
  const cols = [...row];
  while (cols.length < 41) {
    cols.push('');
  }

  return {
    rowNumber: rowIndex,
    rawMetadata: cols.slice(0, 17),
    grNo: cols[17] || '',
    studentName: cols[18] || '',
    bFormNo: cols[19] || '',
    fatherName: cols[20] || '',
    gender: cols[21] || '',
    dobDay: cols[22] || '',
    dobMonth: cols[23] || '',
    dobYear: cols[24] || '',
    classAdmitted: cols[25] || '',
    currentClass: cols[26] || '',
    parentCnic: cols[27] || '',
    religion: cols[28] || '',
    address: cols[29] || '',
    parentContact: cols[30] || '',
    emergencyContact: cols[31] || '',
    admissionDay: cols[32] || '',
    admissionMonth: cols[33] || '',
    admissionYear: cols[34] || '',
    section: cols[35] || '',
    partnerContact: cols[36] || '',
    shift: cols[37] || '',
    medium: cols[38] || '',
    picture: cols[39] || '',
    status: cols[40] || '',
  };
}

export function studentDataRange(sheetTitle: string, rowNumber: number): string {
  return `'${sheetTitle}'!${FIRST_STUDENT_DATA_COLUMN}${rowNumber}:${LAST_STUDENT_DATA_COLUMN}${rowNumber}`;
}

export function studentRecordToRow(record: Partial<StudentRecord>): string[] {
  const meta = [...(record.rawMetadata || [])];
  while (meta.length < 17) {
    meta.push('');
  }
  if (!meta[4]) meta[4] = "People'S School Jamshoro";

  const cell = (v: unknown) => (v === undefined || v === null ? '' : String(v));

  const row: string[] = [
    meta[0] || (record.rowNumber ? String(record.rowNumber - 1) : ''),
    meta[1] || 'N/A',
    meta[2] || '',
    meta[3] || '',
    meta[4] || "People'S School Jamshoro",
    meta[5] || '',
    meta[6] || '',
    meta[7] || '',
    meta[8] || '',
    meta[9] || '',
    meta[10] || '',
    meta[11] || '',
    meta[12] || '',
    meta[13] || '',
    meta[14] || '',
    meta[15] || '',
    meta[16] || '',
    cell(record.grNo),
    cell(record.studentName),
    cell(record.bFormNo),
    cell(record.fatherName),
    cell(record.gender),
    cell(record.dobDay),
    cell(record.dobMonth),
    cell(record.dobYear),
    cell(record.classAdmitted),
    cell(record.currentClass),
    cell(record.parentCnic),
    cell(record.religion),
    cell(record.address),
    cell(record.parentContact),
    cell(record.emergencyContact),
    cell(record.admissionDay),
    cell(record.admissionMonth),
    cell(record.admissionYear),
    cell(record.section),
    cell(record.partnerContact),
    cell(record.shift),
    cell(record.medium),
    cell(record.picture),
    cell(record.status),
  ];

  if (row.length !== STUDENT_META_COLUMN_COUNT + EXPECTED_STUDENT_DATA_COLUMNS) {
    console.warn(
      `studentRecordToRow produced ${row.length} columns, expected ${
        STUDENT_META_COLUMN_COUNT + EXPECTED_STUDENT_DATA_COLUMNS
      }. The register update range may be misaligned.`
    );
  }

  return row;
}

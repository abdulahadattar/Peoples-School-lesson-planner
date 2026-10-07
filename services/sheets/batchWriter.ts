import {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_SHEET_TITLE,
  StudentRecord,
  BatchRecordWriteResult,
  BatchRecordWriteFailure,
} from './types';
import {
  STUDENT_META_COLUMN_COUNT,
  FIRST_STUDENT_DATA_COLUMN,
  studentDataRange,
  studentRecordToRow,
} from './rowMapping';
import { clearClientSheetCache } from './fetcher';
import { classifySheetsWriteError } from './errorClassification';

export { syncAttendanceToSheet } from './attendanceWriter';

export const RECORD_BATCH_SIZE = 50;

export async function updateSheetRecord(
  student: StudentRecord,
  accessToken: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  sheetTitle: string = DEFAULT_SHEET_TITLE
): Promise<{ success: boolean; message: string }> {
  if (!accessToken) {
    throw new Error('Google Sign-In is required to update records directly in Google Sheets.');
  }

  const rowNum = student.rowNumber;
  if (!Number.isInteger(rowNum) || rowNum <= 0) {
    throw new Error(
      `Refusing to update row ${rowNum}: a student with no sheet row must be added, not updated.`
    );
  }

  const rowValues = studentRecordToRow(student);
  const range = studentDataRange(sheetTitle, rowNum);
  const values = rowValues.slice(STUDENT_META_COLUMN_COUNT);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [values],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('Office file') || errorText.includes('FAILED_PRECONDITION')) {
      throw new Error(
        'This operation is not supported because the spreadsheet is an Excel file. Please open the file in Google Drive and select "Save as Google Sheets".'
      );
    }
    throw new Error(`Failed to update Google Sheet: ${errorText || response.statusText}`);
  }

  await clearClientSheetCache(spreadsheetId);
  return { success: true, message: 'Google Sheet updated successfully!' };
}

export async function batchUpdateSheetRecords(
  students: StudentRecord[],
  accessToken: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  sheetTitle: string = DEFAULT_SHEET_TITLE,
  onProgress?: (processed: number, total: number) => void
): Promise<BatchRecordWriteResult> {
  if (!accessToken) {
    throw new Error('Google Sign-In is required to batch-update records in Google Sheets.');
  }

  const validStudents: StudentRecord[] = [];
  const failures: BatchRecordWriteFailure[] = [];

  for (const s of students) {
    if (!Number.isInteger(s.rowNumber) || s.rowNumber <= 0) {
      failures.push({
        rowNumber: s.rowNumber,
        message: `Invalid rowNumber ${s.rowNumber}: a new student must be added with addStudentRecord.`,
      });
    } else {
      validStudents.push(s);
    }
  }

  if (validStudents.length === 0) {
    return { updated: 0, failures, requests: 0 };
  }

  let updated = 0;
  let requests = 0;
  const total = validStudents.length;

  for (let i = 0; i < total; i += RECORD_BATCH_SIZE) {
    const chunk = validStudents.slice(i, i + RECORD_BATCH_SIZE);
    const data = chunk.map((s) => {
      const rowValues = studentRecordToRow(s);
      return {
        range: studentDataRange(sheetTitle, s.rowNumber),
        majorDimension: 'ROWS',
        values: [rowValues.slice(STUDENT_META_COLUMN_COUNT)],
      };
    });

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    requests++;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const classified = classifySheetsWriteError(`${response.status} ${errorText}`);
        for (const s of chunk) {
          failures.push({
            rowNumber: s.rowNumber,
            message: classified.message,
          });
        }
        if (classified.kind === 'auth' || classified.kind === 'scope') {
          const unsent = validStudents.slice(i + RECORD_BATCH_SIZE);
          for (const s of unsent) {
            failures.push({
              rowNumber: s.rowNumber,
              message: classified.message,
            });
          }
          break;
        }
      } else {
        updated += chunk.length;
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      for (const s of chunk) {
        failures.push({
          rowNumber: s.rowNumber,
          message: msg,
        });
      }
    }

    onProgress?.(Math.min(i + RECORD_BATCH_SIZE, total), total);
  }

  if (updated > 0) {
    await clearClientSheetCache(spreadsheetId);
  }

  return {
    updated,
    failures,
    requests,
  };
}

export async function addStudentRecord(
  student: StudentRecord | Omit<StudentRecord, 'rowNumber'>,
  accessToken: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  sheetTitle: string = DEFAULT_SHEET_TITLE
): Promise<{ success: boolean; message: string }> {
  if (!accessToken) {
    throw new Error('Google Sign-In is required to add new records to Google Sheets.');
  }

  const rowValues = studentRecordToRow(student);
  const range = `'${sheetTitle}'!${FIRST_STUDENT_DATA_COLUMN}:${FIRST_STUDENT_DATA_COLUMN}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [rowValues],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('Office file') || errorText.includes('FAILED_PRECONDITION')) {
      throw new Error(
        'This operation is not supported because the spreadsheet is an Excel file. Please open the file in Google Drive and select "Save as Google Sheets".'
      );
    }
    try {
      const serverRes = await fetch('/api/sheets/add', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId,
          sheetTitle,
          rowValues,
        }),
      });
      if (serverRes.ok) {
        await clearClientSheetCache(spreadsheetId);
        return { success: true, message: 'New student added successfully to Google Sheet.' };
      }
    } catch {
      // ignore
    }
    throw new Error(`Failed to append to Google Sheet: ${errorText || response.statusText}`);
  }

  await clearClientSheetCache(spreadsheetId);
  return { success: true, message: 'New student added successfully to Google Sheet.' };
}

export const addSheetRecord = addStudentRecord;

import { ATTENDANCE_SPREADSHEET_ID } from './types';
import { describeAttendanceSyncError } from './errorClassification';

const ATTENDANCE_HEADERS = [
  'Date',
  'Recorded By',
  'Class',
  'Enrolled Boys',
  'Enrolled Girls',
  'Attendance %',
  'Total Enrolled',
  'Present Boys',
  'Present Girls',
  'Total Present',
  'Total Absent',
  'Notes',
  'Class Teacher',
  'Timestamp',
];
const ATTENDANCE_TAB = 'Sheet1';
const ATTENDANCE_COLUMNS = ATTENDANCE_HEADERS.length;

export async function syncAttendanceToSheet(
  record: {
    date: string;
    recordedBy?: string;
    notes?: string;
    summary: {
      totalEnrolled: number;
      totalPresent: number;
      totalAbsent: number;
      overallPercentage: number;
    };
    rows: any[];
  },
  accessToken?: string | null
): Promise<{ success: boolean; message: string }> {
  const timestamp = new Date().toISOString();

  const rowsToWrite = record.rows.map((r) => [
    record.date,
    record.recordedBy || 'Unassigned',
    r.displayName,
    r.enrolledBoys,
    r.enrolledGirls,
    `${r.percentage}%`,
    r.totalEnrolled,
    typeof r.presentBoys === 'number' ? r.presentBoys : 0,
    typeof r.presentGirls === 'number' ? r.presentGirls : 0,
    r.totalPresent,
    r.absentTotal,
    record.notes || '',
    r.classTeacher || '',
    timestamp,
  ]);

  rowsToWrite.push([
    record.date,
    record.recordedBy || 'Unassigned',
    'TOTAL ATTENDANCE',
    '',
    '',
    `${record.summary.overallPercentage}%`,
    record.summary.totalEnrolled,
    '',
    '',
    record.summary.totalPresent,
    record.summary.totalAbsent,
    record.notes || '',
    '',
    timestamp,
  ]);

  if (!accessToken) {
    throw new Error(
      'Your Google sign-in has expired, so the register was not sent to the sheet. ' +
        'Sign out and sign in with Google again (the sheet needs that to stay connected), then save again. ' +
        'The register itself is saved in the app either way.'
    );
  }

  const authHeaders = { Authorization: `Bearer ${accessToken}` };
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
  const api = (path: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${ATTENDANCE_SPREADSHEET_ID}/values/${path}`;
  const fullRange = `'${ATTENDANCE_TAB}'!A1:N1`;

  const headerRes = await fetch(api(encodeURIComponent(fullRange)), { headers: authHeaders });
  if (!headerRes.ok) {
    throw describeAttendanceSyncError(
      headerRes.status,
      await headerRes.text(),
      'reading the attendance sheet header',
      ATTENDANCE_TAB
    );
  }
  const headerData = await headerRes.json();
  const currentHeader: string[] = headerData.values?.[0] || [];
  const headerMatches =
    currentHeader.length >= ATTENDANCE_COLUMNS &&
    ATTENDANCE_HEADERS.every((h, i) => (currentHeader[i] || '').trim() === h);

  if (!headerMatches) {
    const headerPut = await fetch(`${api(encodeURIComponent(fullRange))}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ range: fullRange, majorDimension: 'ROWS', values: [ATTENDANCE_HEADERS] }),
    });
    if (!headerPut.ok) {
      throw describeAttendanceSyncError(
        headerPut.status,
        await headerPut.text(),
        'writing the attendance sheet header',
        ATTENDANCE_TAB
      );
    }
  }

  const allValuesRes = await fetch(api(encodeURIComponent(`'${ATTENDANCE_TAB}'!A:A`)), {
    headers: authHeaders,
  });
  if (!allValuesRes.ok) {
    throw describeAttendanceSyncError(
      allValuesRes.status,
      await allValuesRes.text(),
      'scanning the attendance sheet for existing rows',
      ATTENDANCE_TAB
    );
  }
  const allValues = (await allValuesRes.json()).values || [];
  const rowsToClear: number[] = [];
  allValues.forEach((row, idx) => {
    if (String(row?.[0] ?? '').trim() === record.date) rowsToClear.push(idx + 1);
  });

  if (rowsToClear.length) {
    const requests = rowsToClear.map((r) => ({
      range: `'${ATTENDANCE_TAB}'!A${r}:N${r}`,
    }));
    const clearRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${ATTENDANCE_SPREADSHEET_ID}/values:batchClear`,
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ ranges: requests.map((x) => x.range) }),
      }
    );
    if (!clearRes.ok) {
      throw describeAttendanceSyncError(
        clearRes.status,
        await clearRes.text(),
        `clearing the previous rows for ${record.date}`,
        ATTENDANCE_TAB
      );
    }
  }

  const appendRange = `'${ATTENDANCE_TAB}'!A:A`;
  const appendRes = await fetch(
    `${api(encodeURIComponent(appendRange))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ range: appendRange, majorDimension: 'ROWS', values: rowsToWrite }),
    }
  );
  if (!appendRes.ok) {
    throw describeAttendanceSyncError(
      appendRes.status,
      await appendRes.text(),
      `writing ${record.date}`,
      ATTENDANCE_TAB
    );
  }

  return { success: true, message: 'Attendance synced to Google Sheet!' };
}

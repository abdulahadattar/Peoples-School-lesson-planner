/**
 * Google Sheets Service for Peoples Higher Secondary School Jamshoro (PHSSJ)
 * Synchronizes with Google Sheets file:
 * https://docs.google.com/spreadsheets/d/11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0/edit?gid=1397470354#gid=1397470354
 */

export const DEFAULT_SPREADSHEET_ID = '11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0';
export const DEFAULT_GID = '1397470354';
export const DEFAULT_SHEET_TITLE = 'Jamshoro South Final SPD (2)';
export const DEFAULT_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/11AMKZ-HXUQg4cKsEiEmKgmjfxPMPe4RTnVGlwB_Y7g0/edit?gid=1397470354#gid=1397470354';
export const ATTENDANCE_SPREADSHEET_ID = '1J5eEmFnpqzgrNCZkV0e3bYOdTBE2B-pjczeBq_OYfbA';

export interface StudentRecord {
  rowNumber: number; // 1-based row index in the spreadsheet (header is row 1)
  rawMetadata: string[]; // cols 0 to 16 preserved

  // Visible columns requested for school record:
  grNo: string; // Col 17: GR#
  studentName: string; // Col 18: NAME OF STUDENT
  bFormNo: string; // Col 19: B.FORM NO.
  fatherName: string; // Col 20: FATHER / GUARDIAN NAME
  gender: string; // Col 21: GENDER
  dobDay: string; // Col 22: DD
  dobMonth: string; // Col 23: MM
  dobYear: string; // Col 24: YYYY
  classAdmitted: string; // Col 25: CLASS ADMITTED
  currentClass: string; // Col 26: CURRENT CLASS
  parentCnic: string; // Col 27: PARENT/GUARDIANCNICNO
  religion: string; // Col 28: RELIGION
  address: string; // Col 29: RESIDENTIAL ADDRESS
  parentContact: string; // Col 30: PARENT  GUARDIAN CONTACT
  emergencyContact: string; // Col 31: EMERGENCY CONTACT
  admissionDay: string; // Col 32: DD2
  admissionMonth: string; // Col 33: MM3
  admissionYear: string; // Col 34: YYYY4
  section: string; // Col 35: SECTION
  partnerContact: string; // Col 36: PARTNER CONTACT NUMBER
  shift: string; // Col 37: SHIFT
  medium: string; // Col 38: MEDIUM OF INSTRUCTION -
  picture: string; // Col 39: PICTURE
  status: string; // Col 40: STATUS
}

export const VISIBLE_COLUMNS = [
  { key: 'grNo', label: 'GR#', colIdx: 17, required: true },
  { key: 'studentName', label: 'NAME OF STUDENT', colIdx: 18, required: true },
  { key: 'bFormNo', label: 'B.FORM NO.', colIdx: 19 },
  { key: 'fatherName', label: 'FATHER / GUARDIAN NAME', colIdx: 20, required: true },
  { key: 'gender', label: 'GENDER', colIdx: 21 },
  { key: 'dobDay', label: 'DD', colIdx: 22 },
  { key: 'dobMonth', label: 'MM', colIdx: 23 },
  { key: 'dobYear', label: 'YYYY', colIdx: 24 },
  { key: 'classAdmitted', label: 'CLASS ADMITTED', colIdx: 25 },
  { key: 'currentClass', label: 'CURRENT CLASS', colIdx: 26, required: true },
  { key: 'parentCnic', label: 'PARENT/GUARDIANCNICNO', colIdx: 27 },
  { key: 'religion', label: 'RELIGION', colIdx: 28 },
  { key: 'address', label: 'RESIDENTIAL ADDRESS', colIdx: 29 },
  { key: 'parentContact', label: 'PARENT  GUARDIAN CONTACT', colIdx: 30 },
  { key: 'emergencyContact', label: 'EMERGENCY CONTACT', colIdx: 31 },
  { key: 'admissionDay', label: 'DD2', colIdx: 32 },
  { key: 'admissionMonth', label: 'MM3', colIdx: 33 },
  { key: 'admissionYear', label: 'YYYY4', colIdx: 34 },
  { key: 'section', label: 'SECTION', colIdx: 35 },
  { key: 'partnerContact', label: 'PARTNER CONTACT NUMBER', colIdx: 36 },
  { key: 'shift', label: 'SHIFT', colIdx: 37 },
  { key: 'medium', label: 'MEDIUM OF INSTRUCTION -', colIdx: 38 },
  { key: 'picture', label: 'PICTURE', colIdx: 39 },
  { key: 'status', label: 'STATUS', colIdx: 40 },
] as const;

/**
 * Standard CSV Parser handling quotes, commas, escaped quotes and multi-line fields
 */
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
        i++; // skip next escaped quote
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

/**
 * Maps a parsed row array into a structured StudentRecord object
 */
export function rowToStudentRecord(row: string[], rowIndex: number): StudentRecord {
  // Ensure array has at least 41 elements
  const cols = [...row];
  while (cols.length < 41) {
    cols.push('');
  }

  return {
    rowNumber: rowIndex, // 1-based (header is row 1)
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

/**
 * Converts a StudentRecord back into the full 41-element row array for Google Sheets
 */
export function studentRecordToRow(record: StudentRecord): string[] {
  // Default metadata for People's School Jamshoro if missing
  const meta = [...(record.rawMetadata || [])];
  while (meta.length < 17) {
    meta.push('');
  }
  if (!meta[4]) meta[4] = "People'S School Jamshoro";
  if (!meta[5]) meta[5] = 'Ziauddin University';
  if (!meta[13]) meta[13] = 'Jamshoro (South)';
  if (!meta[14]) meta[14] = 'Kotri';
  if (!meta[15]) meta[15] = 'Sindh University';
  if (!meta[16]) meta[16] = 'Sindh University Housing Society Phase 1';

  return [
    meta[0] || String(record.rowNumber - 1),
    meta[1] || 'N/A',
    meta[2] || '190400001',
    meta[3] || 'Higher Secondary',
    meta[4] || "People'S School Jamshoro",
    meta[5] || 'Ziauddin University',
    meta[6] || 'PAS/LEGIS/B-12',
    meta[7] || '25',
    meta[8] || '24',
    meta[9] || '473',
    meta[10] || '68',
    meta[11] || '16',
    meta[12] || '541',
    meta[13] || 'Jamshoro (South)',
    meta[14] || 'Kotri',
    meta[15] || 'Sindh University',
    meta[16] || 'Sindh University Housing Society Phase 1',
    record.grNo,
    record.studentName,
    record.bFormNo,
    record.fatherName,
    record.gender,
    record.dobDay,
    record.dobMonth,
    record.dobYear,
    record.classAdmitted,
    record.currentClass,
    record.parentCnic,
    record.religion,
    record.address,
    record.parentContact,
    record.emergencyContact,
    record.admissionDay,
    record.admissionMonth,
    record.admissionYear,
    record.section,
    record.partnerContact,
    record.shift,
    record.medium,
    record.picture,
    record.status,
  ];
}

export interface FetchSheetResult {
  records: StudentRecord[];
  spreadsheetId: string;
  gid: string;
  sheetTitle: string;
  lastSynced: Date;
  isLive: boolean;
}

/**
 * Fetch records from Google Sheets.
 * Uses the server-side proxy route `/api/sheets/data` which fetches the live sheet,
 * or direct Google Sheets API if an access token is provided.
 */
let sheetDataCache: Record<string, { timestamp: number; data: FetchSheetResult }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchSheetData(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  gid: string = DEFAULT_GID,
  accessToken?: string | null,
  forceRefresh: boolean = false
): Promise<FetchSheetResult> {
  const cacheKey = `${spreadsheetId}-${gid}-${accessToken ? 'auth' : 'public'}`;
  
  if (!forceRefresh && sheetDataCache[cacheKey] && Date.now() - sheetDataCache[cacheKey].timestamp < CACHE_TTL) {
    return sheetDataCache[cacheKey].data;
  }

  try {
    // 1. Try server-side proxy
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(
      `/api/sheets/data?spreadsheetId=${encodeURIComponent(spreadsheetId)}&gid=${encodeURIComponent(gid)}`,
      { headers }
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.records)) {
        const result = {
          records: data.records,
          spreadsheetId,
          gid,
          sheetTitle: data.sheetTitle || DEFAULT_SHEET_TITLE,
          lastSynced: new Date(),
          isLive: true,
        };
        sheetDataCache[cacheKey] = { timestamp: Date.now(), data: result };
        return result;
      }
    }
  } catch (err) {
    console.warn('Server proxy fetch failed, falling back to direct export:', err);
  }

  // Fallback to direct export fetch
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      throw new Error(`Failed to fetch spreadsheet CSV: HTTP ${csvRes.status}`);
    }
    const csvText = await csvRes.text();
    const rows = parseCSV(csvText);

    if (rows.length <= 1) {
      const emptyResult = {
        records: [],
        spreadsheetId,
        gid,
        sheetTitle: DEFAULT_SHEET_TITLE,
        lastSynced: new Date(),
        isLive: true,
      };
      sheetDataCache[cacheKey] = { timestamp: Date.now(), data: emptyResult };
      return emptyResult;
    }

    // Header is row 0; data starts at row 1 -> rowNumber = index + 1
    const records: StudentRecord[] = [];
    for (let i = 1; i < rows.length; i++) {
      const student = rowToStudentRecord(rows[i], i + 1);
      if (student.grNo || student.studentName) {
        records.push(student);
      }
    }

    const result = {
      records,
      spreadsheetId,
      gid,
      sheetTitle: DEFAULT_SHEET_TITLE,
      lastSynced: new Date(),
      isLive: true,
    };
    sheetDataCache[cacheKey] = { timestamp: Date.now(), data: result };
    return result;
  } catch (fallbackErr) {
    console.warn('All sheet fetch methods failed, returning empty records:', fallbackErr);
    return {
      records: [],
      spreadsheetId,
      gid,
      sheetTitle: DEFAULT_SHEET_TITLE,
      lastSynced: new Date(),
      isLive: true,
    };
  }
}

/**
 * Update an existing student record in Google Sheets.
 * Requires Google OAuth token.
 */
export async function updateSheetRecord(
  student: StudentRecord,
  accessToken: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  sheetTitle: string = DEFAULT_SHEET_TITLE
): Promise<{ success: boolean; message: string }> {
  if (!accessToken) {
    throw new Error('Google Sign-In is required to update records directly in Google Sheets.');
  }

  const rowValues = studentRecordToRow(student);
  const rowNum = student.rowNumber;

  // Try direct Google Sheets API v4
  const range = `'${sheetTitle}'!A${rowNum}:AO${rowNum}`;
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
      values: [rowValues],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('Office file') || errorText.includes('FAILED_PRECONDITION')) {
      throw new Error('This operation is not supported because the spreadsheet is an Excel file. Please open the file in Google Drive and select "Save as Google Sheets".');
    }
    // Fallback to server proxy route
    try {
      const serverRes = await fetch('/api/sheets/update', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId,
          sheetTitle,
          rowNumber: rowNum,
          rowValues,
        }),
      });
      if (serverRes.ok) {
        return { success: true, message: 'Row updated successfully in Google Sheet.' };
      }
    } catch {
      // ignore
    }
    throw new Error(`Failed to update Google Sheet: ${errorText || response.statusText}`);
  }

  return { success: true, message: 'Row updated successfully in Google Sheet.' };
}

/**
 * Append a new student record to Google Sheets.
 * Requires Google OAuth token.
 */
export async function addSheetRecord(
  student: Omit<StudentRecord, 'rowNumber'>,
  accessToken: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  sheetTitle: string = DEFAULT_SHEET_TITLE
): Promise<{ success: boolean; message: string }> {
  if (!accessToken) {
    throw new Error('Google Sign-In is required to append records directly to Google Sheets.');
  }

  const fullRecord: StudentRecord = {
    ...student,
    rowNumber: 99999, // will be appended
  };
  const rowValues = studentRecordToRow(fullRecord);

  const range = `'${sheetTitle}'!A:AO`;
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
      throw new Error('This operation is not supported because the spreadsheet is an Excel file. Please open the file in Google Drive and select "Save as Google Sheets".');
    }
    // Fallback to server proxy
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
        return { success: true, message: 'New student added successfully to Google Sheet.' };
      }
    } catch {
      // ignore
    }
    throw new Error(`Failed to append to Google Sheet: ${errorText || response.statusText}`);
  }

  return { success: true, message: 'New student added successfully to Google Sheet.' };
}

/**
 * Export records as CSV file for download
 */
export function exportRecordsToCSV(records: StudentRecord[], filename: string = 'PHSSJ_Student_Records.csv'): void {
  const headers = VISIBLE_COLUMNS.map((col) => col.label);
  const rows = records.map((record) => {
    return [
      record.grNo,
      record.studentName,
      record.bFormNo,
      record.fatherName,
      record.gender,
      record.dobDay,
      record.dobMonth,
      record.dobYear,
      record.classAdmitted,
      record.currentClass,
      record.parentCnic,
      record.religion,
      record.address,
      record.parentContact,
      record.emergencyContact,
      record.admissionDay,
      record.admissionMonth,
      record.admissionYear,
      record.section,
      record.partnerContact,
      record.shift,
      record.medium,
      record.picture,
      record.status,
    ].map((val) => `"${(val || '').replace(/"/g, '""')}"`);
  });

  const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

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
  try {
    const headerValues = ['Date', 'Recorded By', 'Class', 'Enrolled Boys', 'Enrolled Girls', 'Attendance %', 'Total Enrolled', 'Present Boys', 'Present Girls', 'Total Present', 'Total Absent', 'Notes', 'Timestamp'];
    
    const rowsToAppend = record.rows.map(r => [
      record.date,
      r.classTeacher || record.recordedBy || 'Class Teacher',
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
      new Date().toISOString()
    ]);

    // Add the summary row at the end
    rowsToAppend.push([
      record.date,
      record.recordedBy || 'Class Teacher',
      'WHOLE SCHOOL',
      '',
      '',
      `${record.summary.overallPercentage}%`,
      record.summary.totalEnrolled,
      '',
      '',
      record.summary.totalPresent,
      record.summary.totalAbsent,
      record.notes || '',
      new Date().toISOString()
    ]);

    if (accessToken) {
      // 1. Check headers
      try {
        const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ATTENDANCE_SPREADSHEET_ID}/values/${encodeURIComponent(`'Sheet1'!A1:M1`)}`;
        const getRes = await fetch(getUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          const firstHeader = getData.values?.[0]?.[2];
          // If headers are missing, or if it has the OLD headers (where Col C was 'Total Enrolled' instead of 'Class')
          if (!getData.values || getData.values.length === 0 || getData.values[0].length === 0 || firstHeader !== 'Class') {
            // Write new expanded headers
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ATTENDANCE_SPREADSHEET_ID}/values/${encodeURIComponent(`'Sheet1'!A1:M1`)}?valueInputOption=USER_ENTERED`;
            await fetch(updateUrl, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ range: `'Sheet1'!A1:M1`, majorDimension: 'ROWS', values: [headerValues] }),
            });
            
            // Wait a moment before appending to ensure headers are flushed, though usually synchronous
          }
        }
      } catch (err) {
        console.warn('Could not check/update headers', err);
      }

      // 2. Append rows
      const range = `'Sheet1'!A:A`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${ATTENDANCE_SPREADSHEET_ID}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: rowsToAppend,
        }),
      });

      if (response.ok) {
        return { success: true, message: 'Attendance synced successfully to Google Sheet!' };
      } else {
        const errorText = await response.text();
        if (errorText.includes('Office file') || errorText.includes('FAILED_PRECONDITION')) {
          throw new Error('This operation is not supported because the spreadsheet is an Excel file. Please open the file in Google Drive and select "Save as Google Sheets".');
        }
      }
    }

    // Fallback to server route
    const serverRes = await fetch('/api/attendance/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        spreadsheetId: ATTENDANCE_SPREADSHEET_ID,
        rowValues: rowsToAppend,
      }),
    });

    if (serverRes.ok) {
      return { success: true, message: 'Attendance synced successfully to Google Sheet via server!' };
    }
  } catch (err) {
    console.warn('Attendance Google Sheet sync warning:', err);
  }

  return { success: false, message: 'Attendance saved locally and server, sheet sync pending authorization.' };
}


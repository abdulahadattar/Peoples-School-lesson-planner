import { getCachedStudentRecords, setCachedStudentRecords, clearCachedStudentRecords } from './storageService';

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
  rawMetadata?: string[]; // cols 0 to 16 preserved (optional in compact mode)

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
 * The first 17 columns of a student row (A-Q) are per-student metadata:
 * registration number, institution, address, and enrolment counts. The app does
 * not read these back per record - the compact payload strips `rawMetadata` and
 * refills it from a single shared row - so they must never be written during an
 * update. Everything from column R onwards is the student data the app owns.
 */
export const STUDENT_META_COLUMN_COUNT = 17;
export const FIRST_STUDENT_DATA_COLUMN = 'R';
export const LAST_STUDENT_DATA_COLUMN = 'AO';
/** Number of app-owned student fields, i.e. R through AO. */
const EXPECTED_STUDENT_DATA_COLUMNS = 24;

/** Sheet range covering only the app-owned student columns for one row. */
export function studentDataRange(sheetTitle: string, rowNumber: number): string {
  return `'${sheetTitle}'!${FIRST_STUDENT_DATA_COLUMN}${rowNumber}:${LAST_STUDENT_DATA_COLUMN}${rowNumber}`;
}

/**
 * Converts a StudentRecord back into the full 41-element row array for Google Sheets
 */
export function studentRecordToRow(record: StudentRecord): string[] {
  const meta = [...(record.rawMetadata || [])];
  while (meta.length < 17) {
    meta.push('');
  }
  // Only genuinely school-wide constants are filled in here. This function used
  // to invent a registration number ('190400001'), a full address, and a set of
  // enrolment counts (25/24/473/68/16/541) whenever rawMetadata was empty - which
  // is precisely the case for a newly added student. Those fabricated values were
  // written straight into the live register, producing a duplicate ID row and
  // enrollment figures belonging to a different student. Unknown values now stay
  // empty rather than being invented.
  if (!meta[4]) meta[4] = "People'S School Jamshoro";

  // Any field the record does not carry becomes an explicit empty cell.
  // Left as undefined it serialises to null in the request body, and Sheets
  // treats a null under valueInputOption=USER_ENTERED as "clear this cell" -
  // so a record missing one optional field silently blanked that column on save.
  const cell = (v: unknown) => (v === undefined || v === null ? '' : String(v));

  const row: string[] = [
    meta[0] || String(record.rowNumber - 1),
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

  // Guard the A:Q / R boundary: if a field is ever added or removed, the update
  // path would start writing the wrong columns, so fail loudly instead.
  if (row.length !== STUDENT_META_COLUMN_COUNT + (EXPECTED_STUDENT_DATA_COLUMNS)) {
    console.warn(
      `studentRecordToRow produced ${row.length} columns, expected ${
        STUDENT_META_COLUMN_COUNT + EXPECTED_STUDENT_DATA_COLUMNS
      }. The register update range may be misaligned.`
    );
  }

  return row;
}

export interface FetchSheetResult {
  records: StudentRecord[];
  spreadsheetId: string;
  gid: string;
  sheetTitle: string;
  lastSynced: Date;
  isLive: boolean;
  schoolMetadata?: string[];
  fromCache?: boolean;
}

export interface EnrollmentSummaryResult {
  totalEnrolled: number;
  totalBoys: number;
  totalGirls: number;
  classCounts: Record<string, { boys: number; girls: number; total: number }>;
  count: number;
}

/**
 * In-memory fallback cache
 */
let inMemorySheetCache: Record<string, { timestamp: number; etag?: string; data: FetchSheetResult }> = {};
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function clearClientSheetCache(spreadsheetId: string = DEFAULT_SPREADSHEET_ID, gid: string = DEFAULT_GID): Promise<void> {
  const cacheKeySuffix = `${spreadsheetId}_${gid}`;
  inMemorySheetCache = {};
  await clearCachedStudentRecords(cacheKeySuffix);
}

/**
 * Fetch records from Google Sheets with app-level payload minimization & IndexedDB caching.
 * Uses HTTP 304 conditional revalidation, Gzip compression, and compact JSON payloads.
 */
export async function fetchSheetData(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  gid: string = DEFAULT_GID,
  accessToken?: string | null,
  forceRefresh: boolean = false
): Promise<FetchSheetResult> {
  const cacheKeySuffix = `${spreadsheetId}_${gid}`;
  const memoryKey = `${spreadsheetId}-${gid}-${accessToken ? 'auth' : 'public'}`;

  // 1. Check in-memory cache first if not force refresh
  if (!forceRefresh && inMemorySheetCache[memoryKey] && Date.now() - inMemorySheetCache[memoryKey].timestamp < CLIENT_CACHE_TTL_MS) {
    return { ...inMemorySheetCache[memoryKey].data, fromCache: true };
  }

  // 2. Check IndexedDB persistent cache
  const idbCached = await getCachedStudentRecords(cacheKeySuffix);
  if (!forceRefresh && idbCached && Date.now() - idbCached.timestamp < CLIENT_CACHE_TTL_MS && idbCached.records.length > 0) {
    const cachedResult: FetchSheetResult = {
      records: idbCached.records,
      spreadsheetId: idbCached.spreadsheetId || spreadsheetId,
      gid: idbCached.gid || gid,
      sheetTitle: idbCached.sheetTitle || DEFAULT_SHEET_TITLE,
      lastSynced: new Date(idbCached.timestamp),
      isLive: true,
      fromCache: true,
    };
    inMemorySheetCache[memoryKey] = { timestamp: idbCached.timestamp, etag: idbCached.etag, data: cachedResult };
    return cachedResult;
  }

  try {
    // 3. Request optimized compact payload from server proxy with ETag conditional validation
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    // If we have an existing cached ETag, send If-None-Match to allow 304 with 0 bytes transferred
    const existingEtag = idbCached?.etag || inMemorySheetCache[memoryKey]?.etag;
    if (existingEtag && !forceRefresh) {
      headers['If-None-Match'] = existingEtag;
    }

    // If forceRefresh is requested, pass no-cache and refresh flags to bypass server and proxy caches
    if (forceRefresh) {
      headers['Cache-Control'] = 'no-cache';
      headers['Pragma'] = 'no-cache';
    }

    const refreshQuery = forceRefresh ? '&refresh=true' : '';
    const res = await fetch(
      `/api/sheets/data?spreadsheetId=${encodeURIComponent(spreadsheetId)}&gid=${encodeURIComponent(gid)}&compact=true${refreshQuery}`,
      { headers }
    );

    // If 304 Not Modified, reuse our local cached data with zero network payload!
    if (res.status === 304 && idbCached && idbCached.records.length > 0) {
      await setCachedStudentRecords(
        {
          records: idbCached.records,
          etag: existingEtag,
          sheetTitle: idbCached.sheetTitle,
          spreadsheetId,
          gid,
        },
        cacheKeySuffix
      );
      const cachedResult: FetchSheetResult = {
        records: idbCached.records,
        spreadsheetId,
        gid,
        sheetTitle: idbCached.sheetTitle || DEFAULT_SHEET_TITLE,
        lastSynced: new Date(),
        isLive: true,
        fromCache: true,
      };
      inMemorySheetCache[memoryKey] = { timestamp: Date.now(), etag: existingEtag, data: cachedResult };
      return cachedResult;
    }

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.records)) {
        const responseEtag = res.headers.get('ETag') || data.etag;
        const schoolMetadata = data.schoolMetadata || [];

        // Normalize student records (populate default school metadata if needed)
        const normalizedRecords: StudentRecord[] = data.records.map((r: any) => ({
          ...r,
          rawMetadata: r.rawMetadata || schoolMetadata,
        }));

        const result: FetchSheetResult = {
          records: normalizedRecords,
          spreadsheetId,
          gid,
          sheetTitle: data.sheetTitle || DEFAULT_SHEET_TITLE,
          lastSynced: new Date(),
          isLive: true,
          schoolMetadata,
        };

        // Persist into IndexedDB and in-memory cache
        await setCachedStudentRecords(
          {
            records: normalizedRecords,
            etag: responseEtag,
            sheetTitle: data.sheetTitle || DEFAULT_SHEET_TITLE,
            spreadsheetId,
            gid,
          },
          cacheKeySuffix
        );

        inMemorySheetCache[memoryKey] = { timestamp: Date.now(), etag: responseEtag, data: result };
        return result;
      }
    }
  } catch (err) {
    console.warn('Server proxy fetch failed, falling back to local cache or direct export:', err);
  }

  // If network failed but we have stale IndexedDB cache, return it rather than failing
  if (idbCached && idbCached.records.length > 0) {
    const fallbackResult: FetchSheetResult = {
      records: idbCached.records,
      spreadsheetId,
      gid,
      sheetTitle: idbCached.sheetTitle || DEFAULT_SHEET_TITLE,
      lastSynced: new Date(idbCached.timestamp),
      isLive: false,
      fromCache: true,
    };
    return fallbackResult;
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

    const result: FetchSheetResult = {
      records,
      spreadsheetId,
      gid,
      sheetTitle: DEFAULT_SHEET_TITLE,
      lastSynced: new Date(),
      isLive: true,
    };

    await setCachedStudentRecords(
      {
        records,
        sheetTitle: DEFAULT_SHEET_TITLE,
        spreadsheetId,
        gid,
      },
      cacheKeySuffix
    );

    inMemorySheetCache[memoryKey] = { timestamp: Date.now(), data: result };
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
 * Ultra-compact enrollment summary fetcher.
 * Retrieves only aggregated class totals (~300 bytes) instead of downloading all 866 student records.
 */
export async function fetchEnrollmentSummary(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  gid: string = DEFAULT_GID,
  accessToken?: string | null,
  forceRefresh: boolean = false
): Promise<EnrollmentSummaryResult | null> {
  // 1. If we already have full records in local cache, calculate summary locally with 0 network bytes!
  const cacheKeySuffix = `${spreadsheetId}_${gid}`;
  const idbCached = await getCachedStudentRecords(cacheKeySuffix);
  if (!forceRefresh && idbCached && idbCached.records.length > 0) {
    const classCounts: Record<string, { boys: number; girls: number; total: number }> = {};
    let totalEnrolled = 0;
    let totalBoys = 0;
    let totalGirls = 0;

    idbCached.records.forEach((s: any) => {
      const cls = (s.currentClass || 'Unassigned').trim();
      const g = (s.gender || '').toUpperCase();
      const isBoy = g.startsWith('M') || g.startsWith('B') || g === 'BOY';
      const isGirl = g.startsWith('F') || g.startsWith('G') || g === 'GIRL';

      if (!classCounts[cls]) {
        classCounts[cls] = { boys: 0, girls: 0, total: 0 };
      }
      if (isBoy) {
        classCounts[cls].boys++;
        totalBoys++;
      } else if (isGirl) {
        classCounts[cls].girls++;
        totalGirls++;
      }
      classCounts[cls].total++;
      totalEnrolled++;
    });

    return {
      totalEnrolled,
      totalBoys,
      totalGirls,
      classCounts,
      count: idbCached.records.length,
    };
  }

  // 2. Otherwise fetch ultra-compact aggregated summary from server (~300 bytes payload)
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const res = await fetch(
      `/api/sheets/data?spreadsheetId=${encodeURIComponent(spreadsheetId)}&gid=${encodeURIComponent(gid)}&summaryOnly=true`,
      { headers }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        totalEnrolled: data.totalEnrolled || 0,
        totalBoys: data.totalBoys || 0,
        totalGirls: data.totalGirls || 0,
        classCounts: data.classCounts || {},
        count: data.count || 0,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch enrollment summary:', err);
  }
  return null;
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
  //
  // Only the app-owned columns (R onwards) are written. This previously wrote the
  // whole row A:AO, where columns A-Q came from rawMetadata - which in compact
  // mode is stripped per record and refilled from a single shared sheet row. Every
  // edit therefore stamped another student's registration number, address and
  // enrolment counts over the row being edited, and blanked the rest. Leaving
  // A-Q untouched keeps each student's own metadata intact.
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
          // Server must apply the same column restriction as the direct call.
          startColumn: FIRST_STUDENT_DATA_COLUMN,
          metaColumnCount: STUDENT_META_COLUMN_COUNT,
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

  await clearClientSheetCache(spreadsheetId);
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

/** Header layout of the attendance sheet. */
const ATTENDANCE_HEADERS = [
  'Date', 'Recorded By', 'Class', 'Enrolled Boys', 'Enrolled Girls', 'Attendance %',
  'Total Enrolled', 'Present Boys', 'Present Girls', 'Total Present', 'Total Absent',
  'Notes', 'Class Teacher', 'Timestamp',
];
const ATTENDANCE_TAB = 'Sheet1';
const ATTENDANCE_COLUMNS = ATTENDANCE_HEADERS.length; // A..N

/**
 * Turns a Sheets API failure into something a teacher can act on.
 *
 * These used to be swallowed: a non-OK response that was not the Excel-file case
 * fell through to the server fallback and then to a generic
 * "sheet sync pending authorization" message, while the app reported the save as
 * successful. A 403 for a missing scope, a 400 for a wrong tab name and a 401 for
 * an expired token all looked identical from the UI.
 */
function describeAttendanceSyncError(status: number, body: string, context: string): Error {
  const detail = (() => {
    try {
      const parsed = JSON.parse(body);
      return parsed?.error?.message || parsed?.error_description || body;
    } catch {
      return body;
    }
  })().slice(0, 400);

  if (status === 401) {
    return new Error(
      `Google rejected the sign-in token (401) while ${context}. Sign out and sign in again with Google, ` +
      `then retry.`
    );
  }
  if (status === 403) {
    return new Error(
      `Google denied write access (403) while ${context}. The signed-in account needs Editor access to the ` +
      `attendance sheet, and must re-authorise to grant the Google Sheets scope. Sign out, sign in again, ` +
      `and ask the sheet owner to share it with you as an editor. Detail: ${detail}`
    );
  }
  if (status === 404) {
    return new Error(
      `The attendance sheet or its "${ATTENDANCE_TAB}" tab was not found (404) while ${context}. ` +
      `Check the spreadsheet ID and that the tab is still named "${ATTENDANCE_TAB}".`
    );
  }
  if (status === 400) {
    return new Error(
      `Google rejected the request (400) while ${context}. This usually means the tab name is wrong or the ` +
      `row shape does not match the sheet. Detail: ${detail}`
    );
  }
  return new Error(`Attendance sheet sync failed (HTTP ${status}) while ${context}. Detail: ${detail}`);
}

/**
 * Classify a Google Sheets write failure so the UI says the right thing.
 *
 * The previous check treated any error mentioning `403` as "the sheet is
 * protected or View-Only". Google uses 403 for far more than sharing: an
 * expired or invalid access token, a missing scope, and a quota breach all come
 * back 403. Reporting those as a Drive-permission problem sent the user to
 * Google Drive to fix sharing when the actual fix was reconnecting Google -
 * and the problem was reported right after reconnecting, which made it look
 * like the reconnect had failed.
 *
 * `kind` is what the caller should do about it:
 * - `auth`      - reconnect (a token problem)
 * - `scope`     - re-authorise so the Sheets scope is granted
 * - `permission`- the sheet genuinely needs Editor sharing
 * - `quota`     - retry later
 * - `unknown`   - show the detail as-is
 */
export type SheetsWriteErrorKind = 'auth' | 'scope' | 'permission' | 'quota' | 'unknown';

export function classifySheetsWriteError(errMessage: string): {
  kind: SheetsWriteErrorKind;
  message: string;
} {
  const raw = (errMessage || '').trim();
  const m = raw.toLowerCase();
  // Keep the underlying detail visible: a diagnosis the user cannot check is a
  // diagnosis they cannot act on.
  const detail = raw ? `Google said: ${raw}` : '';

  // Auth failures first. They dominate the 403 space and are the most
  // commonly mis-attributed, so they are tested before permission.
  if (
    m.includes('401') ||
    m.includes('invalid authentication credentials') ||
    m.includes('token has been expired') ||
    m.includes('token expired') ||
    m.includes('token has been expired or revoked') ||
    m.includes('invalid_grant') ||
    (m.includes('403') && (m.includes('token') || m.includes('bearer') || m.includes('credential')))
  ) {
    return {
      kind: 'auth',
      message:
        'Google rejected the sign-in because the access token is expired or invalid. ' +
        `Press "Reconnect Google" to get a fresh token, then press Sync again. ${detail}`,
    };
  }

  if (m.includes('scope') || m.includes('insufficient authentication scopes')) {
    return {
      kind: 'scope',
      message:
        'This account has not granted the Google Sheets permission. ' +
        `Sign in with Google again and accept the Sheets access prompt. ${detail}`,
    };
  }

  if (m.includes('ratelimit') || m.includes('rate limit') || m.includes('quota')) {
    return {
      kind: 'quota',
      message:
        'Google is rate-limiting writes to this spreadsheet. ' +
        `Wait a minute and press Sync again. ${detail}`,
    };
  }

  if (
    m.includes('permission') ||
    m.includes('does not have permission') ||
    (m.includes('403') && m.includes('forbidden')) ||
    m.includes('protected')
  ) {
    return {
      kind: 'permission',
      message:
        'Google Sheet is protected or View-Only in Google Drive. ' +
        'You do not have direct write access to this spreadsheet in the cloud. ' +
        `Ask the sheet owner to share it with you as an Editor. ${detail}`,
    };
  }

  return { kind: 'unknown', message: raw };
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
  const timestamp = new Date().toISOString();

  const rowsToWrite = record.rows.map(r => [
    record.date,
    // The recorder, not the class teacher. This column previously carried the
    // class teacher, so the sheet showed "Class In-Charge" or a teacher's name as
    // who signed the register; the class teacher now has its own column.
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

  // 1. Ensure the header row matches, checking every column rather than one cell.
  const headerRes = await fetch(api(encodeURIComponent(fullRange)), { headers: authHeaders });
  if (!headerRes.ok) {
    throw describeAttendanceSyncError(
      headerRes.status,
      await headerRes.text(),
      'reading the attendance sheet header'
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
        'writing the attendance sheet header'
      );
    }
  }

  // 2. Replace any existing block for this date.
  //
  // The sync used to append unconditionally, so re-saving a date left a second,
  // conflicting set of rows in the sheet while Firestore kept a single record -
  // the two drifted apart. Rows for the date are located and cleared first so
  // the sheet always mirrors the saved record.
  const allValuesRes = await fetch(api(encodeURIComponent(`'${ATTENDANCE_TAB}'!A:A`)), {
    headers: authHeaders,
  });
  if (!allValuesRes.ok) {
    throw describeAttendanceSyncError(
      allValuesRes.status,
      await allValuesRes.text(),
      'scanning the attendance sheet for existing rows'
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
        `clearing the previous rows for ${record.date}`
      );
    }
  }

  // 3. Write the current figures.
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
    throw describeAttendanceSyncError(appendRes.status, await appendRes.text(), `writing ${record.date}`);
  }

  return { success: true, message: 'Attendance synced to Google Sheet!' };
}


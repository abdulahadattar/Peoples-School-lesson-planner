import { SheetsWriteErrorKind } from './types';

export function classifySheetsWriteError(errMessage: string): {
  kind: SheetsWriteErrorKind;
  message: string;
} {
  const raw = (errMessage || '').trim();
  const m = raw.toLowerCase();
  const detail = raw ? `Google said: ${raw}` : '';

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

export function describeAttendanceSyncError(
  status: number,
  body: string,
  context: string,
  attendanceTab: string = 'Sheet1'
): Error {
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
      `The attendance sheet or its "${attendanceTab}" tab was not found (404) while ${context}. ` +
      `Check the spreadsheet ID and that the tab is still named "${attendanceTab}".`
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

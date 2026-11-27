import { toUserErrorMessage } from '../../utils/userMessage';

export function runUserMessageTests(t: {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
}) {
  const { describe, it, eq } = t;

  describe('userMessage.toUserErrorMessage');

  it('returns fallback for null, undefined, or empty values', () => {
    eq(toUserErrorMessage(null, 'Something went wrong.'), 'Something went wrong.');
    eq(toUserErrorMessage(undefined, 'Try again.'), 'Try again.');
    eq(toUserErrorMessage(new Error('   '), 'Failed.'), 'Failed.');
  });

  it('strips internal technical jargon and stack traces back to fallback', () => {
    eq(
      toUserErrorMessage(new Error('Cloud Firestore permission schema mismatch'), 'Could not save changes.'),
      'Could not save changes.'
    );
    eq(
      toUserErrorMessage(new Error('Gemini API key missing for OCR pipeline ingestion'), 'Automatic reading unavailable.'),
      'Automatic reading unavailable.'
    );
    eq(
      toUserErrorMessage('<html><body>502 Bad Gateway</body></html>', 'Upload failed.'),
      'Upload failed.'
    );
    eq(
      toUserErrorMessage(new Error('TypeError: Cannot read properties at foo (app.js:12:4)'), 'Could not load data.'),
      'Could not load data.'
    );
  });

  it('maps common network, size, permission, and auth errors to plain school language', () => {
    eq(
      toUserErrorMessage(new Error('Failed to fetch'), 'Save failed.'),
      'Connection problem. Please check your internet and try again.'
    );
    eq(
      toUserErrorMessage(new Error('HTTP 413 Request Entity Too Large'), 'Upload failed.'),
      'File is too large to upload. Try a smaller file or fewer pages.'
    );
    eq(
      toUserErrorMessage(new Error('403 Forbidden'), 'Action failed.'),
      'You do not have permission for this action.'
    );
    eq(
      toUserErrorMessage(new Error('401 unauthenticated'), 'Sync failed.'),
      'Please sign in with Google and try again.'
    );
    eq(
      toUserErrorMessage(new Error('Firebase: Error (auth/popup-closed-by-user).'), 'Sign-in failed.'),
      'Sign-in was cancelled. Please try again.'
    );
    eq(
      toUserErrorMessage(
        new Error('Server proxy error 401: {"error":"GEMINI_API_KEY is not configured on the server."}'),
        'Generation failed.'
      ),
      'Gemini API key is not configured or invalid. Please check GEMINI_API_KEY in Settings > Secrets and try again.'
    );
    eq(
      toUserErrorMessage(new Error('429 RESOURCE_EXHAUSTED: rate limit exceeded'), 'Request failed.'),
      'Service is busy right now. Please wait a moment and try again.'
    );
    eq(
      toUserErrorMessage(
        new Error(`Failed generating MCQ batch 1/2: Unexpected token '<', "<!doctype "... is not valid JSON`),
        'Failed to create exam paper. Please try again.'
      ),
      'Failed to create exam paper. Please try again.'
    );
    eq(
      toUserErrorMessage(
        new Error('Server endpoint returned an HTML page instead of JSON.'),
        'Failed to create exam paper. Please try again.'
      ),
      'Failed to create exam paper. Please try again.'
    );
  });

  it('preserves short, clean, plain-language error messages', () => {
    eq(
      toUserErrorMessage(new Error('Student GR #1042 was not found.'), 'Lookup failed.'),
      'Student GR #1042 was not found.'
    );
  });
}

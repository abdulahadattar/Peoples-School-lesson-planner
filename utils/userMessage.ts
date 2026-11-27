const JARGON_OR_TRACE_PATTERN =
  /<!doctype|<html|<body|\bat\s+[\w.$]+\s*\(|\b(firestore|firebase|indexeddb|gemini|api[_\s-]?key|oauth|token|payload|schema|compiler|telemetry|ingestion|pipeline|inference|orchestrat\w*|heuristic\w*|a2ui|ocr|dossier\w*|discrepanc\w*|typeerror|referenceerror|syntaxerror|econn\w*|enotfound|etimedout|unexpected token|not valid json|non-json|html page|html error page|server proxy|server endpoint)\b|\bserver\s+error\s*\(\d{3}\)|\bhttp\s*\d{3}\b/i;

const NETWORK_PATTERN =
  /\b(network|failed to fetch|fetch failed|offline|err_internet|err_network|timeout|timed out|abort(ed)?)\b/i;

const AUTH_PATTERN =
  /\b(unauthenticated|not signed in|sign in required|needsAuth|401|auth\/|insufficient authentication)\b/i;

const POPUP_CANCELLED_PATTERN =
  /\b(popup[_-]closed[_-]by[_-]user|cancelled[_-]popup[_-]request|popup blocked|user closed the popup|sign[- ]in cancelled)\b/i;

const QUOTA_PATTERN =
  /\b(429|rate limit|too many requests|quota exceeded|resource[_-]exhausted)\b/i;

const PAYLOAD_TOO_LARGE_PATTERN = /\b(413|payload too large|entity too large|request too large)\b/i;

const PERMISSION_PATTERN = /\b(permission-denied|permission denied|403|forbidden|unauthorized)\b/i;

const MISSING_AI_KEY_PATTERN =
  /\b(GEMINI_API_KEY is not configured|API key not set|API_KEY_INVALID|api key not valid)\b/i;

/** Converts runtime errors into short, plain-language UI messages. */
export function toUserErrorMessage(err: unknown, fallback: string): string {
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '';

  const singleLine = raw.replace(/\s+/g, ' ').trim();
  if (!singleLine) return fallback;

  if (POPUP_CANCELLED_PATTERN.test(singleLine)) {
    return 'Sign-in was cancelled. Please try again.';
  }
  if (QUOTA_PATTERN.test(singleLine)) {
    return 'Service is busy right now. Please wait a moment and try again.';
  }
  if (PAYLOAD_TOO_LARGE_PATTERN.test(singleLine)) {
    return 'File is too large to upload. Try a smaller file or fewer pages.';
  }
  if (NETWORK_PATTERN.test(singleLine)) {
    return 'Connection problem. Please check your internet and try again.';
  }
  if (MISSING_AI_KEY_PATTERN.test(singleLine)) {
    return 'Gemini API key is not configured or invalid. Please check GEMINI_API_KEY in Settings > Secrets and try again.';
  }
  if (AUTH_PATTERN.test(singleLine)) {
    return 'Please sign in with Google and try again.';
  }
  if (PERMISSION_PATTERN.test(singleLine)) {
    return 'You do not have permission for this action.';
  }
  if (JARGON_OR_TRACE_PATTERN.test(singleLine) || singleLine.length > 160) {
    return fallback;
  }

  return singleLine;
}

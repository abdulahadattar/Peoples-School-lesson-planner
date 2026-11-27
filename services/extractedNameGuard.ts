/**
 * extractedNameGuard.ts — keeps model prose out of student name fields.
 *
 * The AI archivist is asked for structured fields, but on a crowded B-Form it
 * sometimes answers a *name* field with its own reasoning. A real run on
 * D:\Enrollment 2026\XI produced:
 *
 *   studentNameUrdu: "محمد یامین (اردو متن مترجم ...). نوٹ: اس فارم میں چار بچے
 *                     درج ہیں، فہرست درج ذیل ہے: 1. محمد يامين
 *                     (41506-0504781-7), 2. ... )"
 *
 * — 300+ characters of prose listing four children's B-Form numbers. That value
 * is written straight into the dossier and can reach the student register.
 *
 * `isInvalidPersonName()` in documentArchiveService only guards the *English*
 * fields, and only against an English boilerplate denylist, so it catches
 * neither a long paragraph nor Urdu/Sindhi boilerplate. These helpers cover the
 * script fields (studentNameUrdu, studentNameSindhi, fatherNameUrdu,
 * fatherNameSindhi).
 *
 * Everything here is pure and side-effect free so it can be unit tested
 * without a browser, a network or Firebase.
 */

/** Longest plausible single name, with room for "Abdul" + patronymic + surname. */
export const MAX_NAME_LENGTH = 60;

/** A name is not a sentence. */
export const MAX_NAME_WORDS = 6;

/** Urdu/Sindhi/Arabic block, incl. the Arabic Presentation Forms. */
export function containsArabicScript(value: string): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(value);
}

/**
 * NADRA identity numbers (B-Form and CNIC) are long digit runs or
 * hyphenated groups, e.g. 41506-0504781-7 or 41204-2649073-5.
 */
export function containsNadraLikeNumber(value: string): boolean {
  return /\d{5,}/.test(value) || /\d{4,}[-–]\d{4,}[-–]\d+/.test(value);
}

/** Words the model uses when it starts narrating instead of answering. */
const NARRATION_MARKERS = [
  'note:',
  'note -',
  'notes:',
  'translation',
  'translated',
  'transliterat',
  'as per the',
  'this document',
  'the original',
  'not available',
  'unclear',
  'illegible',
  'cannot be',
  'unable to',
];

/** Trailing noise stripped from an otherwise plausible name. */
const EDGE_NOISE = /^[\s"'`“‘«(\[]+|[\s"'`”’»)\].,;:!?،]+$/g;

/**
 * Normalise a name-shaped value: trim, collapse whitespace, strip wrapping
 * quotes/brackets and dangling punctuation.
 *
 * Returns '' for null/empty input.
 */
export function normalizeNameValue(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value.replace(EDGE_NOISE, '').replace(/\s+/g, ' ').trim();
}

/** Human-readable reason a value was rejected, or null when it looks like a name. */
export function describeNameRejection(value?: string | null): string | null {
  const raw = typeof value === 'string' ? value : '';
  const n = normalizeNameValue(raw);
  if (!n) return 'empty';

  if (n.length > MAX_NAME_LENGTH) {
    return `too long (${n.length} chars, max ${MAX_NAME_LENGTH}) — looks like prose, not a name`;
  }
  if (containsNadraLikeNumber(n)) {
    return 'contains a NADRA identity number (B-Form/CNIC) — not a name';
  }
  if (/[\r\n\t]/.test(raw)) {
    return 'contains a line break — looks like prose, not a name';
  }
  if (n.split(' ').length > MAX_NAME_WORDS) {
    return `too many words (${n.split(' ').length}, max ${MAX_NAME_WORDS}) — looks like prose, not a name`;
  }
  const lower = n.toLowerCase();
  const marker = NARRATION_MARKERS.find(m => lower.includes(m));
  if (marker) {
    return `contains narration marker "${marker}" — the model explained instead of answering`;
  }
  // A long run of ASCII letters inside an otherwise Arabic-script value usually
  // means the model answered in English where a script name was asked for.
  if (containsArabicScript(n)) {
    const latinWords = n.match(/[A-Za-z]{4,}/g);
    if (latinWords && latinWords.length > 2) {
      return `mixes scripts with ${latinWords.length} long Latin words — looks like an explanation`;
    }
  }
  return null;
}

/**
 * The value to store for a script-language name field, or undefined when the
 * model returned something that is not a name.
 *
 * @param value    raw model output
 * @param onReject optional sink for the rejection reason and the raw text, so
 *                 the caller can log it instead of silently dropping data
 */
export function sanitizeScriptNameField<T>(
  value: string | undefined | null,
  onReject?: (reason: string, raw: string) => void
): string | undefined {
  const reason = describeNameRejection(value);
  if (reason) {
    if (typeof value === 'string' && value.trim()) onReject?.(reason, value);
    return undefined;
  }
  const n = normalizeNameValue(value);
  return n || undefined;
}

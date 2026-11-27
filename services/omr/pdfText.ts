/**
 * Strips non-WinAnsi characters before drawing strings with StandardFonts in pdf-lib.
 */
export function sanitizePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

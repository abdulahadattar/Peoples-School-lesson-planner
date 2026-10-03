/**
 * identityNormalization.ts — Canonical normalization for student identifiers.
 *
 * Centralizes GR number collapsing, NADRA (B-Form/CNIC) formatting, phone formatting,
 * and avatar color/initials derivation across student records, attendance, and documents.
 */

/**
 * Collapses a GR number to a canonical numerical key (or trimmed string).
 * Handles formats like "56", " 56 ", "056", "56.0", "GR-56", "GR_56".
 */
export function normalizeGrKey(raw?: string | null): string {
  if (!raw) return '';
  let str = String(raw).trim();
  // Handle Excel/Sheets decimal outputs like "56.0" or "56.00"
  if (/^\d+\.0+$/.test(str)) {
    str = str.split('.')[0];
  }
  const digits = str.replace(/[^0-9]/g, '');
  if (!digits) return str.toUpperCase();
  const parsed = parseInt(digits, 10);
  return isNaN(parsed) ? digits : String(parsed);
}

/**
 * Normalizes NADRA B-Form or CNIC numbers by extracting all 13 digits.
 * Returns empty string if not a plausible digit run.
 */
export function normalizeNadraNumber(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits;
}

/**
 * Formats a 13-digit Pakistani CNIC/B-Form into standard hyphenated pattern:
 * XXXXX-XXXXXXX-X (e.g. 41506-0504781-7).
 */
export function formatCnicDisplay(raw?: string | null): string {
  if (!raw) return '';
  const digits = normalizeNadraNumber(raw);
  if (digits.length !== 13) return String(raw).trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

/**
 * Formats a Pakistani phone number into readable format.
 * (e.g. 03001234567 -> 0300-1234567, or +923001234567 -> 0300-1234567).
 */
export function formatPhoneDisplay(raw?: string | null): string {
  if (!raw) return '';
  const clean = String(raw).trim().replace(/[\s-]/g, '');
  if (clean.startsWith('+92')) {
    return '0' + clean.slice(3, 6) + '-' + clean.slice(6);
  }
  if (clean.startsWith('03') && clean.length === 11) {
    return clean.slice(0, 4) + '-' + clean.slice(4);
  }
  return String(raw).trim();
}

/**
 * Extracts 1-2 letter initials from a person's name for display in avatar badges.
 */
export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return 'S';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Gradient background classes for student avatar badges based on deterministic hash.
 */
export const AVATAR_GRADIENTS = [
  'from-indigo-600 to-blue-600 text-white',
  'from-emerald-600 to-teal-700 text-white',
  'from-violet-600 to-purple-700 text-white',
  'from-amber-600 to-orange-700 text-white',
  'from-rose-600 to-pink-700 text-white',
  'from-sky-600 to-cyan-700 text-white',
];

export function getAvatarGradient(seed?: string | null): string {
  if (!seed) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

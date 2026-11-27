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

/**
 * Pakistani / Sindh Name Normalizer:
 * Removes titles, standardizes prefixes, resolves doubled letters (ghaffar/ghafar, sattar/satar),
 * and normalizes common phonetic transliteration variants (i/y, ee/i, oo/u, a/u).
 */
export function normalizePakistaniName(name?: string): string {
  if (!name) return '';
  let clean = name.toLowerCase().trim();

  // Strip common honorifics and titles
  clean = clean.replace(/\b(syed|syyed|sayed|hafiz|hafeez|mst|mst\.|bibi|miss|master|mr|mrs|dr|al-haj|haji)\b/gi, ' ');

  // Standardize common Pakistani / Muslim prefixes
  clean = clean.replace(/\b(muhammad|mohammad|mohammed|mohd|md|md\.|m\.)\b/gi, 'muhammad');

  // Normalize common Sindh / Pakistani surname and phonetic variations
  const replacements: Array<[RegExp, string]> = [
    [/\bahmad\b/g, 'ahmed'],
    [/\brahman\b/g, 'rehman'],
    [/\b(husain|hussan|hasan|hassan)\b/g, 'hussain'],
    [/\baly\b/g, 'ali'],
    [/\btarique\b/g, 'tariq'],
    [/\bfarooque\b/g, 'farooq'],
    [/\b(shoib|shuaib)\b/g, 'shoaib'],
    [/\bbarohi\b/g, 'brohi'],
    [/\bchannar\b/g, 'channa'],
    [/\blashary\b/g, 'lashari'],
    [/\brindo\b/g, 'rind'],
    [/\bpanwhar\b/g, 'panhwar'],
    [/\bsumro\b/g, 'soomro'],
    [/\bchandeo\b/g, 'chandio'],
    [/\bsial\b/g, 'siyal'],
    [/\bmagasi\b/g, 'magsi'],
    [/\bbhati\b/g, 'bhatti'],
    [/\bsolangy\b/g, 'solangi'],
    [/\bmalah\b/g, 'mallah'],
    [/\bzardary\b/g, 'zardari'],
    [/\bkhosa\b/g, 'khoso'],
    [/\bjatoy\b/g, 'jatoi'],
    [/\bsarwer\b/g, 'sarwar'],
    [/\bnadim\b/g, 'nadeem'],
    [/\bshahh\b/g, 'shah'],
    // Phonetic vowel & consonant equivalences
    [/\bkhameeso\b/g, 'khamiso'],
    [/\bkunwal\b/g, 'kanwal'],
    [/\bghaffar\b/g, 'ghafar'],
    [/\bsattar\b/g, 'satar'],
    [/\babbasi\b/g, 'abasi'],
    [/\bjabbar\b/g, 'jabar'],
    [/\bmemon\b/g, 'meman'],
    [/\bkhetran\b/g, 'khetiran'],
    [/\b(khooharo|khoharo|khuharo|khoohro|khuhro)\b/g, 'khuhro'],
    [/\b(liaquat|liaqat|liyaqat)\b/g, 'liaquat'],
    [/\b(bakhsh|baksh|bux)\b/g, 'bux'],
    [/\b(sanjarani|sanjrani)\b/g, 'sanjrani'],
  ];

  for (const [pattern, rep] of replacements) {
    clean = clean.replace(pattern, rep);
  }

  // Common interchangeable vowel clusters: ee -> i, oo -> u
  clean = clean.replace(/ee/g, 'i').replace(/oo/g, 'u');

  // Collapse consecutive doubled consonants: ff->f, tt->t, ss->s, mm->m, ll->l, dd->d, bb->b
  clean = clean.replace(/([b-df-hj-np-tv-z])\1+/g, '$1');

  // Convert terminal 'y' to 'i' for names like Aly -> Ali, Solangy -> Solangi
  clean = clean.replace(/\b([a-z]+)y\b/g, '$1i');

  return clean.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export interface NadraValidationResult {
  isValid: boolean;
  digits: string;
  formatted: string;
  issue?: string;
  provinceCode?: number;
  provinceName?: string;
}

/**
 * Validate Pakistani NADRA 13-digit number format & province code
 */
export function validateNadraNumber(val?: string, expectedProvince: number = 4): NadraValidationResult {
  if (!val) return { isValid: false, digits: '', formatted: '', issue: 'Empty NADRA identity number' };
  const digits = val.replace(/\D/g, '');
  if (!digits) return { isValid: false, digits: '', formatted: '', issue: 'No numerical digits found' };

  if (digits.length < 13) {
    return {
      isValid: false,
      digits,
      formatted: val,
      issue: `Incomplete NADRA number: contains only ${digits.length} digits (13 required for official B-Form/CNIC)`,
    };
  }
  if (digits.length > 13) {
    return {
      isValid: false,
      digits,
      formatted: val,
      issue: `Too many digits: contains ${digits.length} digits (standard NADRA format is 13 digits)`,
    };
  }

  const provinceDigit = parseInt(digits[0], 10);
  const provinceNames: Record<number, string> = {
    1: 'Khyber Pakhtunkhwa',
    2: 'FATA',
    3: 'Punjab',
    4: 'Sindh',
    5: 'Balochistan',
    6: 'Islamabad Capital Territory',
    7: 'Gilgit-Baltistan / AJK',
  };

  const formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  const provinceName = provinceNames[provinceDigit] || 'Unknown Province';

  return {
    isValid: true,
    digits,
    formatted,
    provinceCode: provinceDigit,
    provinceName,
  };
}


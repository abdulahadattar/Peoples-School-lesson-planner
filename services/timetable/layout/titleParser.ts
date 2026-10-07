import { collapse } from './cellUtils';

const CLASS_PATTERNS: RegExp[] = [
  /\bgrade\s*-?\s*([0-9]{1,2}|[ivxlc]{1,6}(?:\s*-\s*[a-z])?)\b/i,
  /\b([ivxlc]{1,6})\s*-\s*([a-z])\b/i,
  /\b([ivxlc]{1,6})\b/i,
];

const TITLE_PREFIX_RE = /^\s*time\s*tables?\b\s*/i;
const TITLE_NOISE_WORD_RE = /^\s*(?:for|of|grade|class|section|subject|teacher|schedule|schedual)\b\s*/i;

export function parseTitle(raw: string): { classLabel: string; teacher: string } {
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map((l) => collapse(l))
    .filter((l) => l.length > 0);
  const flat = lines.join(' ').replace(/\btime\s*tables?\b/gi, ' ').replace(/\s+/g, ' ').trim();

  let classLabel = '';
  for (const pattern of CLASS_PATTERNS) {
    const m = flat.match(pattern);
    if (m) {
      classLabel = collapse(m[1] + (m[2] ? `-${m[2]}` : '')).toUpperCase();
      break;
    }
  }

  const residuals: string[] = [];
  for (const line of lines) {
    let rest = line.replace(TITLE_PREFIX_RE, '');
    if (classLabel) {
      const labelRe = new RegExp(classLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      rest = rest.replace(labelRe, ' ');
    }
    let stripped = rest.replace(TITLE_NOISE_WORD_RE, '');
    while (stripped !== rest) {
      rest = stripped;
      stripped = rest.replace(TITLE_NOISE_WORD_RE, '');
    }
    rest = stripped.replace(/\s+/g, ' ').trim().replace(/^[\s\-:|,.]+/, '').replace(/[\s\-:|,.]+$/, '').trim();
    if (rest) residuals.push(rest);
  }

  let teacher = '';
  for (const candidate of residuals) {
    if (candidate.length > teacher.length) teacher = candidate;
  }
  return { classLabel, teacher };
}

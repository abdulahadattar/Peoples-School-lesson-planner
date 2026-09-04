/**
 * latexSanitizer.ts — repairs math/LaTeX that an AI model produced imperfectly.
 * Applied to every AI-generated string (lesson plans and exam papers) before the
 * content is stored, so broken math can never reach the web preview or the
 * DOCX/PDF exports.
 *
 * Three failure modes are fixed here:
 *
 * 1. Prose wrapped in math delimiters. Models sometimes emphasize words like
 *    "$Bios$" or italic Latin names in $...$ — rendered as math this becomes a
 *    huge stylized glyph instead of ordinary text. Prose-only fragments are
 *    de-delimited and kept as plain text.
 * 2. Real formulas left WITHOUT delimiters (e.g. "P = \frac{1}{3}\rho v^2").
 *    Backslash LaTeX commands and bare powers (v^2, 10^{23}) are wrapped in
 *    $...$ so every renderer treats them as math.
 * 3. Stray/unbalanced "$" characters that would otherwise make a renderer
 *    swallow a whole sentence and show a red KaTeX error.
 *
 * latexToUnicodeText() additionally converts a LaTeX fragment to readable
 * unicode/ASCII text for the PDF exporter, where raster images cannot be placed
 * inline inside a sentence.
 */

import { isFormulaText, LATEX_COMMANDS, MATH_REGEX } from './mathDetection';

export { isFormulaText };

/** Match a LaTeX command plus any immediately following brace groups (≤2 deep). */
const COMMAND_RE = new RegExp(
  `\\\\(?:${LATEX_COMMANDS})\\b\\s*(?:\\{(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\}\\s*)*`,
  'g'
);

/** Match a bare power like v^2 or 10^{23} (a common AI omission). */
const POWER_RE = /\b([A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?)\^(\{[^{}]*\}|[A-Za-z0-9.+\-]+)/g;

/** Returns the character indices of every '$' that belongs to a $...$ pair. */
function pairedDollarIndices(text: string): Set<number> {
  const paired = new Set<number>();
  MATH_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_REGEX.exec(text)) !== null) {
    for (let i = m.index; i < m.index + m[0].length; i++) {
      if (text[i] === '$') paired.add(i);
    }
  }
  return paired;
}

/** Wrap bare LaTeX commands and powers (not already inside $...$) in $...$. */
function wrapBareMath(text: string): string {
  if (!text || (!/\\/.test(text) && !/\^/.test(text))) return text;

  const paired = pairedDollarIndices(text);
  const wrapped: string[] = [];
  let cursor = 0;

  const flush = (end: number) => {
    if (end > cursor) wrapped.push(text.slice(cursor, end));
  };

  // Pass 1 — LaTeX command sequences (\frac{1}{3}, \rho, \overline{v^2}, ...)
  COMMAND_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  while ((cm = COMMAND_RE.exec(text)) !== null) {
    if (cm.index < cursor) continue;
    if (paired.has(cm.index)) continue;
    flush(cm.index);
    wrapped.push(`$${cm[0].trim()}$`);
    cursor = cm.index + cm[0].length;
  }
  flush(text.length);

  // Pass 2 — bare powers in the remaining plain text
  const plain = wrapped.join('');
  if (!/\^/.test(plain)) return plain;

  const paired2 = pairedDollarIndices(plain);
  const out: string[] = [];
  let cur = 0;
  POWER_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = POWER_RE.exec(plain)) !== null) {
    if (paired2.has(pm.index)) continue;
    if (pm.index < cur) continue;
    if (pm.index > cur) out.push(plain.slice(cur, pm.index));
    out.push(`$${pm[0]}$`);
    cur = pm.index + pm[0].length;
  }
  if (cur < plain.length) out.push(plain.slice(cur));
  return out.join('');
}

/**
 * Repair one AI-generated string:
 *  - demote prose-only $...$ fragments to plain text,
 *  - wrap bare LaTeX commands / powers in delimiters,
 *  - drop stray unbalanced '$' characters.
 */
export function sanitizeMathText(text: string): string {
  if (!text) return text;
  if (!text.includes('$')) {
    // No delimiters at all — only bare-command repair applies
    return /\\/.test(text) || /\^/.test(text) ? wrapBareMath(text) : text;
  }

  const out: string[] = [];
  let cursor = 0;

  MATH_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_REGEX.exec(text)) !== null) {
    const start = m.index;
    const token = m[0];
    if (start > cursor) out.push(wrapBareMath(text.slice(cursor, start)));

    const display = token.startsWith('$$');
    const inner = display ? token.slice(2, -2).trim() : token.slice(1, -1).trim();

    if (!isFormulaText(inner) && /[A-Za-z]/.test(inner)) {
      // Prose wrongly wrapped as math — keep the words as plain text
      out.push(inner);
    } else {
      out.push(token);
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) out.push(wrapBareMath(text.slice(cursor)));

  // Drop any '$' left unmatched after repair (would make renderers pair
  // unrelated regions and show a red error)
  const joined = out.join('');
  if (!joined.includes('$')) return joined;
  const stillPaired = pairedDollarIndices(joined);
  const kept: string[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '$' && !stillPaired.has(i)) continue; // drop stray $
    kept.push(joined[i]);
  }
  return kept.join('');
}

/** Convenience: sanitize every string field of a parsed AI object in place. */
export function sanitizeStringFields(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeMathText(value);
  if (Array.isArray(value)) return value.map(sanitizeStringFields);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) result[key] = sanitizeStringFields((value as Record<string, unknown>)[key]);
    return result;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  latexToUnicodeText — LaTeX fragment -> readable text for PDF       */
/* ------------------------------------------------------------------ */

/** Greek letters LaTeX -> unicode. */
const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

/** Superscript digits / signs that the PDF font (Roboto) contains. */
const SUP_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', '(': '⁽', ')': '⁾',
};

/** Subscript digits available in Roboto. */
const SUB_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅',
  '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

const SIMPLE_CMDS: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pm: '±', approx: '≈', neq: '≠', leq: '≤',
  geq: '≥', infty: '∞', rightarrow: '→', leftarrow: '←', to: '→', mid: '|',
  ldots: '...', cdots: '...', vdots: '⋮', ddots: '⋱', simeq: '≈', partial: '∂',
};

const NAMED_FUNCS = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'lim', 'max', 'min']);

/** Superscript for a short token (digits/signs -> unicode, else ^(...) ASCII). */
function toSuperscript(token: string): string {
  if (!token) return '';
  if (/^[0-9+\-()]+$/.test(token)) return [...token].map(ch => SUP_MAP[ch] || ch).join('');
  return `^(${token})`;
}

function toSubscript(token: string): string {
  if (/^[0-9]+$/.test(token)) return [...token].map(ch => SUB_MAP[ch] || ch).join('');
  return `_(${token})`;
}

interface Cursor {
  s: string;
  i: number;
}

/** Read letters/digits forming one token (stops at spaces/braces/operators). */
function readToken(c: Cursor): string {
  const s = c.s;
  const start = c.i;
  while (c.i < s.length && !/[\s{}^_\\]/.test(s[c.i])) c.i += 1;
  return s.slice(start, c.i);
}

/** Convert until the matching '}' is consumed (or end of string). */
function convertBlock(c: Cursor): string {
  const s = c.s;
  let out = '';
  while (c.i < s.length) {
    const ch = s[c.i];
    if (ch === '}') { c.i += 1; break; }
    if (ch === '{') { c.i += 1; out += convertBlock(c); continue; }
    if (ch === '\\') {
      c.i += 1;
      const nameStart = c.i;
      while (c.i < s.length && /[A-Za-z]/.test(s[c.i])) c.i += 1;
      const name = s.slice(nameStart, c.i);
      if (!name) continue;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        let num = '';
        if (s[c.i] === '{') { c.i += 1; num = convertBlock(c); } else num = readToken(c);
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        let den = '';
        if (s[c.i] === '{') { c.i += 1; den = convertBlock(c); } else den = readToken(c);
        const simpleNum = num.length > 0 && num.length <= 2 && /^[0-9A-Za-z]+$/.test(num);
        const simpleDen = den.length > 0 && den.length <= 2 && /^[0-9A-Za-z]+$/.test(den);
        out += simpleNum && simpleDen ? `${num}/${den}` : `(${num})/(${den})`;
        continue;
      }
      if (name === 'sqrt') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') { c.i += 1; out += `√(${convertBlock(c)})`; }
        else out += `√${readToken(c)}`;
        continue;
      }
      if (name === 'overline' || name === 'bar' || name === 'underline') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') { c.i += 1; out += `mean(${convertBlock(c)})`; }
        else out += `mean(${readToken(c)})`;
        continue;
      }
      if (name === 'text' || name === 'mathrm' || name === 'textbf' || name === 'textit') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') { c.i += 1; out += convertBlock(c); }
        continue;
      }
      if (name === 'hat' || name === 'vec' || name === 'dot') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') { c.i += 1; out += convertBlock(c); }
        else { out += readToken(c); }
        continue;
      }
      if (name === 'sum') { out += 'Σ'; continue; }
      if (name === 'int') { out += '∫'; continue; }
      if (NAMED_FUNCS.has(name)) { out += `${name} `; continue; }
      if (GREEK[name]) { out += GREEK[name]; continue; }
      if (SIMPLE_CMDS[name]) { out += SIMPLE_CMDS[name]; continue; }
      // left/right/displaystyle/style spacing + unknown commands: keep content only
      continue;
    }
    if (ch === '^') {
      c.i += 1;
      if (s[c.i] === '{') { c.i += 1; out += toSuperscript(convertBlock(c)); }
      else { out += toSuperscript(readToken(c)); }
      continue;
    }
    if (ch === '_') {
      c.i += 1;
      if (s[c.i] === '{') { c.i += 1; out += toSubscript(convertBlock(c)); }
      else { out += toSubscript(readToken(c)); }
      continue;
    }
    out += ch;
    c.i += 1;
  }
  return out;
}

/**
 * Convert a LaTeX fragment to readable unicode/ASCII text (no renderer needed).
 * Used by the PDF exporter where images cannot sit inline in a sentence:
 * equations become compact text that flows on the same line at text size.
 */
export function latexToUnicodeText(latex: string): string {
  if (!latex) return '';
  const cursor: Cursor = { s: latex.replace(/^[\s]+|[\s]+$/g, ''), i: 0 };
  return convertBlock(cursor).replace(/\s{2,}/g, ' ').trim();
}

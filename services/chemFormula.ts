/**
 * chemFormula.ts — Lightweight parser for LaTeX \ce{...} chemistry formulas.
 * Converts stoichiometric coefficients, molecular subscripts, ionic charges,
 * hydrate dots, and reaction arrows into structured runs, Unicode text, or
 * standard KaTeX-compatible LaTeX (without requiring the mhchem plugin).
 */

export interface ChemToken {
  text: string;
  script?: 'sup' | 'sub';
}

const SUP_CHAR_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻',
};

const SUB_CHAR_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

function readBracedGroup(s: string, start: number): { content: string; nextIndex: number } {
  let depth = 0;
  let i = start;
  if (s[i] !== '{') return { content: '', nextIndex: i };
  i += 1;
  const contentStart = i;
  while (i < s.length) {
    if (s[i] === '{') depth += 1;
    else if (s[i] === '}') {
      if (depth === 0) {
        return { content: s.slice(contentStart, i), nextIndex: i + 1 };
      }
      depth -= 1;
    }
    i += 1;
  }
  return { content: s.slice(contentStart), nextIndex: s.length };
}

/** Parse the inside of a \ce{...} block into plain, sup, and sub tokens. */
export function parseChemFormula(raw: string): ChemToken[] {
  const s = raw.trim();
  if (!s) return [];

  const tokens: ChemToken[] = [];
  const push = (text: string, script?: 'sup' | 'sub') => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.script === script) {
      prev.text += text;
    } else {
      tokens.push(script ? { text, script } : { text });
    }
  };

  let i = 0;
  let afterTermStart = true; // true at start or right after +, =, arrow, space

  while (i < s.length) {
    const ch = s[i];

    // Spaces reset stoichiometric coefficient context
    if (/\s/.test(ch)) {
      push(' ');
      while (i < s.length && /\s/.test(s[i])) i += 1;
      afterTermStart = true;
      continue;
    }

    // Reaction arrows
    if (s.startsWith('<=>', i)) {
      push('⇌');
      i += 3;
      afterTermStart = true;
      continue;
    }
    if (s.startsWith('<->', i)) {
      push('↔');
      i += 3;
      afterTermStart = true;
      continue;
    }
    if (s.startsWith('->', i)) {
      push('→');
      i += 2;
      afterTermStart = true;
      continue;
    }
    if (s.startsWith('<-', i)) {
      push('←');
      i += 2;
      afterTermStart = true;
      continue;
    }

    // Hydrate / adduct dot between species (e.g. CuSO4.5H2O or CuSO4*5H2O)
    if ((ch === '.' || ch === '*') && !afterTermStart && i + 1 < s.length && /[A-Za-z0-9]/.test(s[i + 1])) {
      push('·');
      i += 1;
      afterTermStart = true;
      continue;
    }

    // State tags (aq), (s), (l), (g)
    const stateMatch = s.slice(i).match(/^\((aq|s|l|g)\)/i);
    if (stateMatch) {
      push(stateMatch[0]);
      i += stateMatch[0].length;
      afterTermStart = false;
      continue;
    }

    // Explicit superscript ^{...} or ^2+ / ^- / ^+ or gas arrow
    if (ch === '^') {
      if (i + 1 >= s.length || /\s/.test(s[i + 1])) {
        push('↑');
        i += 1;
        afterTermStart = true;
        continue;
      }
      i += 1;
      if (s[i] === '{') {
        const { content, nextIndex } = readBracedGroup(s, i);
        push(content, 'sup');
        i = nextIndex;
      } else {
        const m = s.slice(i).match(/^(?:\d*[+-]|[+-]|\d+)/);
        if (m) {
          push(m[0], 'sup');
          i += m[0].length;
        } else {
          push(s[i], 'sup');
          i += 1;
        }
      }
      afterTermStart = false;
      continue;
    }

    // Explicit subscript _{...} or _n
    if (ch === '_') {
      i += 1;
      if (s[i] === '{') {
        const { content, nextIndex } = readBracedGroup(s, i);
        push(content, 'sub');
        i = nextIndex;
      } else {
        const m = s.slice(i).match(/^\d+/);
        if (m) {
          push(m[0], 'sub');
          i += m[0].length;
        } else if (i < s.length) {
          push(s[i], 'sub');
          i += 1;
        }
      }
      afterTermStart = false;
      continue;
    }

    // Standalone + separator vs trailing ionic charge (Na+, Fe2+, Cl-)
    if (ch === '+' || ch === '-') {
      const prevChar = i > 0 ? s[i - 1] : '';
      const nextChar = i + 1 < s.length ? s[i + 1] : '';
      const isTrailingIonCharge =
        !afterTermStart &&
        prevChar &&
        !/\s/.test(prevChar) &&
        (!nextChar || /[\s,;.)\]]/.test(nextChar));
      if (isTrailingIonCharge) {
        push(ch, 'sup');
        i += 1;
      } else {
        push(ch === '+' ? ' + ' : ch);
        i += 1;
        afterTermStart = true;
      }
      continue;
    }

    // Digits: stoichiometric coefficient after separator, or molecular subscript after element/')'
    if (/\d/.test(ch)) {
      const numMatch = s.slice(i).match(/^\d+/)!;
      const digits = numMatch[0];
      i += digits.length;
      if (afterTermStart) {
        push(digits);
        afterTermStart = false;
      } else if (i < s.length && (s[i] === '+' || s[i] === '-') && (i + 1 >= s.length || /[\s,;.)\]]/.test(s[i + 1]))) {
        // Ion charge like Fe2+ -> 2+ superscript
        push(digits + s[i], 'sup');
        i += 1;
      } else {
        push(digits, 'sub');
      }
      continue;
    }

    // Brackets and parentheses
    if (ch === '(' || ch === '[' || ch === ']' || ch === ')' || ch === '=') {
      push(ch);
      i += 1;
      afterTermStart = ch === '=' || ch === '(' || ch === '[';
      continue;
    }

    // Strip wrapping braces if someone writes \ce{{H2O}}
    if (ch === '{' || ch === '}') {
      i += 1;
      continue;
    }

    // Letters / other punctuation
    push(ch);
    i += 1;
    afterTermStart = false;
  }

  return tokens.map((t) => ({ ...t, text: t.text.replace(/[ \t]{2,}/g, ' ') }));
}

export function chemToUnicode(raw: string): string {
  const tokens = parseChemFormula(raw);
  return tokens
    .map((t) => {
      if (t.script === 'sup') {
        const mapped = [...t.text].map((ch) => SUP_CHAR_MAP[ch] ?? ch).join('');
        return mapped === t.text ? `^(${t.text})` : mapped;
      }
      if (t.script === 'sub') {
        const mapped = [...t.text].map((ch) => SUB_CHAR_MAP[ch] ?? ch).join('');
        return mapped === t.text ? `_(${t.text})` : mapped;
      }
      return t.text;
    })
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeLatexText(text: string): string {
  return text.replace(/([%&#_$])/g, '\\$1');
}

/** Convert \ce{...} inside arbitrary LaTeX to standard KaTeX commands. */
export function expandChemInKatexLatex(latex: string): string {
  if (!latex.includes('\\ce')) return latex;
  let out = '';
  let i = 0;
  while (i < latex.length) {
    if (latex.startsWith('\\ce', i) && (i + 3 >= latex.length || !/[A-Za-z]/.test(latex[i + 3]))) {
      let j = i + 3;
      while (j < latex.length && latex[j] === ' ') j += 1;
      if (latex[j] === '{') {
        const { content, nextIndex } = readBracedGroup(latex, j);
        const tokens = parseChemFormula(content);
        const rendered = tokens
          .map((t) => {
            if (t.script === 'sub') return `_{${t.text}}`;
            if (t.script === 'sup') return `^{${t.text}}`;
            const romanText = t.text.replace(/(^|[^\\A-Za-z])([A-Za-z]+)/g, (_m, prefix, w) => `${prefix}\\mathrm{${escapeLatexText(w)}}`);
            return romanText
              .replace(/⇌/g, ' \\rightleftharpoons ')
              .replace(/↔/g, ' \\leftrightarrow ')
              .replace(/→/g, ' \\rightarrow ')
              .replace(/←/g, ' \\leftarrow ')
              .replace(/↑/g, '\\uparrow ')
              .replace(/·/g, '\\cdot ');
          })
          .join('');
        out += rendered;
        i = nextIndex;
        continue;
      }
    }
    out += latex[i];
    i += 1;
  }
  return out;
}

/**
 * inlineMathParser.ts — Pure parser converting mixed prose + Markdown + LaTeX
 * strings into inline styled runs (bold, italic, superscript, subscript, Unicode
 * symbols) or genuine display-equation blocks.
 *
 * Shared by the PDF exporter (pdfMake) and Word exporter (docx) so inline
 * math, units, angles, subscripts, and superscripts stay strictly inline within
 * the running sentence flow and format consistently across PDF and .docx.
 */

import {
  isFormulaText,
  LATEX_GREEK_MAP,
  LATEX_NAMED_FUNCS,
  LATEX_SIMPLE_CMD_MAP,
  LatexCursor,
  MATH_REGEX,
  readLatexBraceContent,
  readLatexToken,
} from '../mathDetection';
import { demoteInlineDisplayMath, sanitizeMathText } from '../latexSanitizer';
import { parseChemFormula } from '../chemFormula';

export interface InlineRichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  sup?: boolean;
  sub?: boolean;
}

export type RichParagraphPart =
  | { kind: 'runs'; runs: InlineRichRun[] }
  | { kind: 'equation'; latex: string; display: boolean };

export interface RichParseOptions {
  /**
   * 'inline-all' keeps every non-display/non-matrix inline $...$ as inline runs
   * (used by PDF where { image } blocks force hard line breaks).
   * 'complex-as-equation' keeps simple inline expressions/units as native text
   * runs and emits complex inline structures (\frac, \sqrt, \sum, \int) as
   * equation segments (used by DOCX where ImageRun sits inline).
   */
  mode?: 'inline-all' | 'complex-as-equation';
  /**
   * When false (e.g. inside MCQ options), demotes single-line $$...$$ blocks to
   * inline runs unless a real matrix or multi-line environment requires an image block.
   */
  allowBlockEquations?: boolean;
}

const BLOCK_ENV_RE = /\\(?:begin|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array|aligned|cases|gathered)\b/i;
const COMPLEX_INLINE_RE = /\\(?:frac|dfrac|tfrac|cfrac|binom|sqrt|sum|int|prod|oint|overline|underline)\b/i;

/** True when a math segment must be rendered as a standalone display block image. */
export function isBlockEquationLatex(latex: string, isDisplay: boolean): boolean {
  if (isDisplay) return true;
  if (BLOCK_ENV_RE.test(latex)) return true;
  if (latex.includes('\\\\')) return true;
  return false;
}

/** True when a math segment has complex 2D notation (\frac, \sqrt, integrals, matrices). */
export function isComplexMathLatex(latex: string, isDisplay: boolean): boolean {
  if (isBlockEquationLatex(latex, isDisplay)) return true;
  return COMPLEX_INLINE_RE.test(latex);
}

/** Merge adjacent runs that share the exact same styling flags. */
export function compactRuns(runs: InlineRichRun[]): InlineRichRun[] {
  const out: InlineRichRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      !!prev.bold === !!r.bold &&
      !!prev.italic === !!r.italic &&
      !!prev.sup === !!r.sup &&
      !!prev.sub === !!r.sub
    ) {
      prev.text += r.text;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Parse Markdown **bold** and *italic* into inline runs. */
export function parseMarkdownToRuns(text: string): InlineRichRun[] {
  if (!text) return [];
  const runs: InlineRichRun[] = [];
  const regex = /(\*\*[^*]+?\*\*|\*[^*]+?\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      runs.push({ text: token.slice(2, -2), bold: true });
    } else {
      runs.push({ text: token.slice(1, -1), italic: true });
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex) });
  }
  return compactRuns(runs);
}

/** Read the single atom after an unbraced ^ or _ (e.g. "2", "-3", "23", "i", or "\circ"). */
function readScriptAtom(c: LatexCursor, script: 'sup' | 'sub'): InlineRichRun[] {
  const s = c.s;
  while (c.i < s.length && s[c.i] === ' ') c.i += 1;
  if (c.i >= s.length) return [];

  if (s[c.i] === '{') {
    c.i += 1;
    const inner = convertBlockToRuns(c, script);
    // Degree symbols (°/′/″) already sit at superscript height — don't double-raise them
    return inner.map((r) => (/^[°′″]+$/.test(r.text) ? { text: r.text } : r));
  }

  if (s[c.i] === '\\') {
    c.i += 1;
    const nameStart = c.i;
    while (c.i < s.length && /[A-Za-z]/.test(s[c.i])) c.i += 1;
    const name = s.slice(nameStart, c.i);
    if (name === 'circ' || name === 'degree') return [{ text: '°' }];
    const sym = LATEX_GREEK_MAP[name] ?? LATEX_SIMPLE_CMD_MAP[name] ?? name;
    return sym ? [{ text: sym, [script]: true }] : [];
  }

  // Signed or unsigned number like -3, +2, 23, 0
  const numMatch = s.slice(c.i).match(/^[+-]?\d+/);
  if (numMatch) {
    c.i += numMatch[0].length;
    return [{ text: numMatch[0], [script]: true }];
  }

  // Single character (e.g., x_i, a^n)
  const ch = s[c.i];
  c.i += 1;
  return [{ text: ch, [script]: true }];
}

function runsToPlainString(runs: InlineRichRun[]): string {
  return runs.map((r) => r.text).join('');
}

function convertBlockToRuns(c: LatexCursor, activeScript?: 'sup' | 'sub'): InlineRichRun[] {
  const s = c.s;
  const runs: InlineRichRun[] = [];
  const pushText = (text: string, script: 'sup' | 'sub' | undefined = activeScript) => {
    if (!text) return;
    runs.push(script ? { text, [script]: true } : { text });
  };

  while (c.i < s.length) {
    const ch = s[c.i];
    if (ch === '}') { c.i += 1; break; }
    if (ch === '{') {
      c.i += 1;
      runs.push(...convertBlockToRuns(c, activeScript));
      continue;
    }
    if (ch === '&') { c.i += 1; pushText('  '); continue; }

    if (ch === '\\') {
      if (s[c.i + 1] === '\\') {
        c.i += 2;
        pushText(' ; ');
        continue;
      }
      c.i += 1;
      const next = s[c.i];
      if (next && !/[A-Za-z]/.test(next)) {
        c.i += 1;
        if (next === ',' || next === ';' || next === ':' || next === ' ') pushText(' ');
        else if (next !== '!') pushText(next);
        continue;
      }
      const nameStart = c.i;
      while (c.i < s.length && /[A-Za-z]/.test(s[c.i])) c.i += 1;
      const name = s.slice(nameStart, c.i);
      if (!name) continue;

      if (name === 'begin' || name === 'end') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        const env = s[c.i] === '{' ? (c.i += 1, runsToPlainString(convertBlockToRuns(c))) : readLatexToken(c);
        if (name === 'begin') {
          pushText(env === 'pmatrix' ? '( ' : env === 'vmatrix' ? '| ' : env === 'Vmatrix' ? '|| ' : '[ ');
        } else {
          pushText(env === 'pmatrix' ? ' )' : env === 'vmatrix' ? ' |' : env === 'Vmatrix' ? ' ||' : ' ]');
        }
        continue;
      }
      if (name === 'det') { pushText('det '); continue; }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        const numRuns = s[c.i] === '{' ? (c.i += 1, convertBlockToRuns(c, activeScript)) : [{ text: readLatexToken(c), ...(activeScript ? { [activeScript]: true } : {}) }];
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        const denRuns = s[c.i] === '{' ? (c.i += 1, convertBlockToRuns(c, activeScript)) : [{ text: readLatexToken(c), ...(activeScript ? { [activeScript]: true } : {}) }];
        const numPlain = runsToPlainString(numRuns);
        const denPlain = runsToPlainString(denRuns);
        const simpleNum = numPlain.length > 0 && numPlain.length <= 3 && /^[0-9A-Za-z]+$/.test(numPlain);
        const simpleDen = denPlain.length > 0 && denPlain.length <= 3 && /^[0-9A-Za-z]+$/.test(denPlain);
        if (simpleNum && simpleDen) {
          runs.push(...numRuns, { text: '/' }, ...denRuns);
        } else {
          pushText('(');
          runs.push(...numRuns);
          pushText(')/(');
          runs.push(...denRuns);
          pushText(')');
        }
        continue;
      }
      if (name === 'sqrt') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') {
          c.i += 1;
          pushText('√(');
          runs.push(...convertBlockToRuns(c, activeScript));
          pushText(')');
        } else {
          pushText(`√${readLatexToken(c)}`);
        }
        continue;
      }
      if (name === 'overline' || name === 'bar' || name === 'underline') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') {
          c.i += 1;
          runs.push(...convertBlockToRuns(c, activeScript));
        } else {
          pushText(readLatexToken(c));
        }
        continue;
      }
      if (name === 'text' || name === 'mathrm' || name === 'textbf' || name === 'textit' || name === 'mathbf' || name === 'mathit') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') {
          c.i += 1;
          const inner = convertBlockToRuns(c, activeScript);
          if (name === 'textbf' || name === 'mathbf') {
            runs.push(...inner.map((r) => ({ ...r, bold: true })));
          } else if (name === 'textit' || name === 'mathit') {
            runs.push(...inner.map((r) => ({ ...r, italic: true })));
          } else {
            runs.push(...inner);
          }
        }
        continue;
      }
      if (name === 'hat' || name === 'vec' || name === 'dot' || name === 'ddot') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') {
          c.i += 1;
          runs.push(...convertBlockToRuns(c, activeScript));
        } else {
          pushText(readLatexToken(c));
        }
        continue;
      }
      if (name === 'ce') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        const chemRaw = readLatexBraceContent(c);
        for (const tok of parseChemFormula(chemRaw)) {
          const script = tok.script ?? activeScript;
          runs.push(script ? { text: tok.text, [script]: true } : { text: tok.text });
        }
        continue;
      }
      if (name === 'textsubscript' || name === 'textsuperscript') {
        const script = name === 'textsubscript' ? 'sub' : 'sup';
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '{') {
          c.i += 1;
          runs.push(...convertBlockToRuns(c, script));
        } else {
          runs.push({ text: readLatexToken(c), [script]: true });
        }
        continue;
      }
      if (name === 'xrightarrow' || name === 'xleftarrow') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '[') {
          c.i += 1;
          while (c.i < s.length && s[c.i] !== ']') c.i += 1;
          if (s[c.i] === ']') c.i += 1;
        }
        const cond = s[c.i] === '{' ? (c.i += 1, runsToPlainString(convertBlockToRuns(c)).trim()) : '';
        const arrow = name === 'xleftarrow' ? '←' : '→';
        pushText(cond ? ` ${arrow}[${cond}] ` : ` ${arrow} `);
        continue;
      }
      if (name === 'left' || name === 'right') {
        while (c.i < s.length && s[c.i] === ' ') c.i += 1;
        if (s[c.i] === '.') c.i += 1;
        continue;
      }
      if (name === 'sum') { pushText('Σ'); continue; }
      if (name === 'int' || name === 'oint') { pushText('∫'); continue; }
      if (name === 'prod') { pushText('Π'); continue; }
      if (name === 'quad' || name === 'qquad') { pushText('  '); continue; }
      if (LATEX_NAMED_FUNCS.has(name)) { pushText(`${name} `); continue; }
      if (LATEX_GREEK_MAP[name]) { pushText(LATEX_GREEK_MAP[name]); continue; }
      if (LATEX_SIMPLE_CMD_MAP[name]) { pushText(LATEX_SIMPLE_CMD_MAP[name]); continue; }
      continue;
    }

    if (ch === '^') {
      c.i += 1;
      runs.push(...readScriptAtom(c, 'sup'));
      continue;
    }
    if (ch === '_') {
      c.i += 1;
      runs.push(...readScriptAtom(c, 'sub'));
      continue;
    }

    pushText(ch);
    c.i += 1;
  }

  return compactRuns(runs);
}

/** Convert an inline LaTeX expression (without $ delimiters) into inline runs. */
export function latexToInlineRuns(latex: string): InlineRichRun[] {
  if (!latex) return [];
  const trimmed = latex.trim();
  const runs = convertBlockToRuns({ s: trimmed, i: 0 });
  // Collapse redundant double spaces while preserving single leading/trailing boundary spaces if any
  return compactRuns(
    runs.map((r) => ({
      ...r,
      text: r.text.replace(/\s{2,}/g, ' '),
    }))
  );
}

/**
 * Split mixed text + $...$ / $$...$$ into sequential inline run groups and
 * standalone equation blocks (when required by the chosen mode).
 */
export function parseTextToRichParts(
  rawText: string,
  options: RichParseOptions = {}
): RichParagraphPart[] {
  const mode = options.mode ?? 'inline-all';
  const allowBlockEquations = options.allowBlockEquations ?? true;
  const text = demoteInlineDisplayMath(sanitizeMathText(rawText), !allowBlockEquations);
  if (!text) return [{ kind: 'runs', runs: [] }];

  const parts: RichParagraphPart[] = [];
  let pendingRuns: InlineRichRun[] = [];

  const flushRuns = () => {
    const compacted = compactRuns(pendingRuns);
    if (compacted.length > 0) {
      parts.push({ kind: 'runs', runs: compacted });
    }
    pendingRuns = [];
  };

  let lastIndex = 0;
  MATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATH_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pendingRuns.push(...parseMarkdownToRuns(text.slice(lastIndex, match.index)));
    }

    const token = match[0];
    const isDisplay = token.startsWith('$$');
    const latex = isDisplay ? token.slice(2, -2).trim() : token.slice(1, -1).trim();

    if (!isFormulaText(latex) && /[A-Za-z]/.test(latex)) {
      pendingRuns.push(...parseMarkdownToRuns(latex));
    } else {
      const hasMultiLineOrMatrix = BLOCK_ENV_RE.test(latex) || latex.includes('\\\\');
      const shouldUseEquationImage =
        mode === 'complex-as-equation'
          ? isComplexMathLatex(latex, isDisplay)
          : allowBlockEquations
            ? isBlockEquationLatex(latex, isDisplay)
            : hasMultiLineOrMatrix;

      if (shouldUseEquationImage) {
        flushRuns();
        parts.push({ kind: 'equation', latex, display: isDisplay });
      } else {
        pendingRuns.push(...latexToInlineRuns(latex));
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    pendingRuns.push(...parseMarkdownToRuns(text.slice(lastIndex)));
  }

  flushRuns();
  return parts.length > 0 ? parts : [{ kind: 'runs', runs: [{ text }] }];
}

/**
 * Shared layout/typography rules for exam papers so the web preview, the DOCX
 * export and the PDF export all agree:
 *
 * - Questions are numbered Q1, Q2, ... sequentially within each section.
 * - Marks are shown ONLY at the section level, never per question.
 * - MCQ options are labelled with a hollow circle the student fills + a
 *   lowercase letter: "○ a) option text".
 * - Two SHORT options share one line with fixed column positions; an option
 *   too long for a column goes on its own line.
 */
import { GeneratedPaper, PaperQuestion, PaperSection, PaperSectionBlueprint } from '../types';
import { isFormulaText, MATH_REGEX } from './mathDetection';
import { latexToUnicodeText } from './latexSanitizer';

/** Hollow circle students fill in to mark their chosen option. */
export const OPTION_CIRCLE = '\u25CB';

/** Max rendered character length for an option to fit in the compact 2x2 grid. */
export const OPTION_COLUMN_BUDGET = 22;

const COMPLEX_OPTION_RE = /\n|\\\\|\$\$|\\(?:frac|dfrac|tfrac|cfrac|binom|sqrt|sum|int|prod|oint|lim|begin|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|aligned|gathered|array)\b/i;

const STUTTERED_PREP_RE = /\b(before|after|until|since|during|within|between|without|above|below|under|over|into|onto|from|with|about|through|towards|against|across|around|behind|beside)\s+(?:in|on|at|to|of|for|by|as|from|with)\s+\1\b/gi;

const CONSECUTIVE_DUP_RE = /\b(a|an|the|in|on|at|to|of|for|by|is|are|was|were|be|been|before|after|with|from|into|onto|and|or|if|then|that|which|when|where|as|per|than)\s+\1\b/gi;

/** Question number shown on the paper, e.g. index 0 -> "Q1". */
export const questionNumber = (index: number): string => `Q${index + 1}`;

/** Lowercase letter for an option index: 0 -> "a", 1 -> "b", ... */
export const optionLetter = (index: number): string => String.fromCharCode(97 + index);

/** Rendered text label for an option: "○ a) ". */
export const optionPrefix = (index: number): string => `${OPTION_CIRCLE} ${optionLetter(index)}) `;

/**
 * Strips AI-generated question numbering, prefixes, trailing mark labels,
 * and duplicate/malformed phrasing artifacts (e.g. "3 s before in before 10 m/s").
 */
export function cleanQuestionText(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip Markdown bold wrappers around question numbering like "**Question 1:**", "**1.**", "**Q1.**"
  cleaned = cleaned.replace(/^\*\*(?:Question\s*\d+|Q\s*\d+|\d+)\s*[:.)-]?\*\*\s*/i, '');
  cleaned = cleaned.replace(/^\*(?:Question\s*\d+|Q\s*\d+|\d+)\s*[:.)-]?\*\s*/i, '');

  // Strip leading question labels safely without mangling decimals ("2.5 s") or hyphenated terms ("X-rays", "p-n")
  cleaned = cleaned.replace(
    /^(?:Question\s+\d+\s*[:.)-]?\s*|Q\.?\s*\d+\s*[:.)-]\s*|\d+\s*(?:\.\s+|\)\s*|:\s+)|\(\s*(?:\d+|[a-zA-Z]|i{1,3}|iv|vi{0,3}|ix|x)\s*\)\s*|(?:i{1,3}|iv|vi{0,3}|ix|x)\s*[.)]\s+|[a-zA-Z]\)\s+)/i,
    ''
  );

  // Strip trailing marks annotations like "(2 Marks)", "[4 marks]", "(1 Mark)", "--- 2 Marks", "(2M)"
  cleaned = cleaned.replace(/\s*(?:[\(\[\{]\s*\d+\s*(?:marks?|mark|m)\s*[\)\]\}]|\s*[-–—]\s*\d+\s*(?:marks?|mark|m))\s*$/i, '');

  // Strip wrapping quotes if any
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '');

  // Normalize duplicate / malformed preposition phrases & consecutive duplicate words
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(STUTTERED_PREP_RE, '$1');
    cleaned = cleaned.replace(CONSECUTIVE_DUP_RE, '$1');
  }

  // Collapse excess horizontal spaces and stray spaces before punctuation
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  cleaned = cleaned.replace(/\s+([,?;:])(?=\s|$)/g, '$1');

  return cleaned.trim();
}

/**
 * Strips AI-generated option prefixes (A, B, C, D, circles, etc.) from an option string
 * and normalizes internal spacing.
 */
export function cleanOptionText(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip leading bullet/circle and safe option labels ("○ a) ", "A) ", "(b) ", "C. ", "Option A: ")
  // Preserves chemical/numeric literals like "1-Butene", "2-Propanol", "1.5 m/s", "1:2", "-5", "d-orbital".
  cleaned = cleaned.replace(/^(?:[○•]\s*|[-*]\s+)?/, '');
  cleaned = cleaned.replace(
    /^(?:Option\s+[a-dA-D1-4]\s*[:.)\-–]?\s*|\([a-dA-D1-4]\)\s*|\[[a-dA-D1-4]\]\s*|[a-dA-D1-4]\s*\)\s*|[a-dA-D1-4]\s*[:.]\s+)/i,
    ''
  );

  // Strip wrapping quotes if any
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '');

  return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Full display line for an option (clean prefix + clean text). */
export const optionLine = (index: number, text: string): string => {
  const clean = cleanOptionText(text);
  return `${optionPrefix(index)}${clean}`;
};

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type McqLetter = (typeof MCQ_LETTERS)[number];

/**
 * Resolve an AI-supplied MCQ answer key reliably across formats:
 * - "D", "(d)", "B.", "Answer: D", "Option C: ... ", "3"
 * - exact or unique matching text from the options array ("Carbon dioxide")
 * Never uses naive regex stripping that turns "Answer: D" -> "A" or "Density" -> "D".
 */
export function parseMcqAnswerKey(
  rawAnswer: unknown,
  options: string[] = []
): { letter: McqLetter; resolvedFrom: 'letter' | 'option_text' | 'default' } {
  const raw = String(rawAnswer ?? '').trim();
  if (!raw) return { letter: 'A', resolvedFrom: 'default' };

  const cleanOpts = options.map((o) => cleanOptionText(o).toLowerCase()).filter(Boolean);

  // 1. Exact single letter A-D
  if (/^[A-Da-d]$/.test(raw)) {
    return { letter: raw.toUpperCase() as McqLetter, resolvedFrom: 'letter' };
  }

  // 2. Numeric index 1-4 ("2", "Option 3", "Answer: 4")
  const numMatch = raw.match(/^(?:(?:Option|Opt|Ans|Answer|Key|Correct(?:\s+Answer)?)\s*[:.\-=#]?\s*)?[\(\[]?\s*([1-4])\s*[\)\].:]?$/i);
  if (numMatch) {
    return { letter: MCQ_LETTERS[Number(numMatch[1]) - 1], resolvedFrom: 'letter' };
  }

  // 3. Explicit labelled choice ("Answer: D", "Option B)", "(c)", "d. hydrogen", "Correct Answer: C")
  const labelledMatch = raw.match(
    /^(?:(?:Correct\s+)?Answer|Ans|Option|Opt|Key)\s*[:.\-=#]?\s*[\(\[○•]?\s*([A-Da-d])\b(?:\s*[\)\].:\-–].*)?$/i
  );
  if (labelledMatch) {
    return { letter: labelledMatch[1].toUpperCase() as McqLetter, resolvedFrom: 'letter' };
  }

  const prefixChoiceMatch = raw.match(/^[\(\[○•]?\s*([A-Da-d])\s*(?:[\)\]]|[:.]\s+.*|[\)\]]\s*.*)$/);
  if (prefixChoiceMatch) {
    return { letter: prefixChoiceMatch[1].toUpperCase() as McqLetter, resolvedFrom: 'letter' };
  }

  // 4. Match option text ("Carbon dioxide", "Density", "48 m/s") before any letter fallback
  if (cleanOpts.length > 0) {
    const cleanRaw = cleanOptionText(raw).toLowerCase();
    const exactIdx = cleanOpts.findIndex((opt) => opt === cleanRaw);
    if (exactIdx >= 0 && exactIdx < 4) {
      return { letter: MCQ_LETTERS[exactIdx], resolvedFrom: 'option_text' };
    }
    const norm = (v: string) => v.replace(/[\s$`"'.,;:()]+/g, '');
    const normRaw = norm(cleanRaw);
    if (normRaw.length >= 2) {
      const normIdx = cleanOpts.findIndex((opt) => norm(opt) === normRaw);
      if (normIdx >= 0 && normIdx < 4) {
        return { letter: MCQ_LETTERS[normIdx], resolvedFrom: 'option_text' };
      }
    }
  }

  return { letter: 'A', resolvedFrom: 'default' };
}

/**
 * Ensures a single question object has pristine structure, clean text without
 * numbering/mark hallucinations, and clean MCQ options.
 */
export function sanitizeSingleQuestion(q: PaperQuestion): PaperQuestion {
  const cleanedText = cleanQuestionText(q.question);
  let options = q.options;

  if (q.type === 'mcq') {
    // If AI crammed options into the question text (e.g. "What is...? A) x B) y C) z D) w")
    if ((!options || options.length === 0) && /[A-D]\)/i.test(cleanedText)) {
      const parts = cleanedText.split(/(?=[A-D]\))/i);
      if (parts.length > 1) {
        const baseQuestion = cleanQuestionText(parts[0]);
        const extractedOptions = parts.slice(1).map(cleanOptionText).filter(Boolean);
        if (extractedOptions.length >= 2) {
          return {
            ...q,
            question: baseQuestion,
            options: extractedOptions,
          };
        }
      }
    }

    if (Array.isArray(options)) {
      options = options.map(cleanOptionText).filter(Boolean);
    }
    const parsedKey = q.correctAnswer !== undefined && q.correctAnswer !== ''
      ? parseMcqAnswerKey(q.correctAnswer, options || [])
      : undefined;
    return {
      ...q,
      question: cleanedText,
      options,
      ...(parsedKey && parsedKey.resolvedFrom !== 'default' ? { correctAnswer: parsedKey.letter } : q.correctAnswer ? { correctAnswer: parsedKey.letter } : {}),
    };
  } else {
    options = undefined;
  }

  return {
    ...q,
    question: cleanedText,
    options,
    correctAnswer: undefined,
  };
}

/** True when an option contains multi-line or complex 2D mathematical notation. */
export function isComplexOption(text: string): boolean {
  const clean = cleanOptionText(text);
  return COMPLEX_OPTION_RE.test(clean);
}

/** Convert an option (which may contain inline $...$ LaTeX and **markdown**) to its rendered plain text. */
export function optionRenderedText(text: string): string {
  let clean = cleanOptionText(text);
  clean = clean.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
  if (!clean.includes('$')) return clean;
  MATH_REGEX.lastIndex = 0;
  const rendered = clean.replace(MATH_REGEX, (token) => {
    const isDisplay = token.startsWith('$$');
    const inner = isDisplay ? token.slice(2, -2).trim() : token.slice(1, -1).trim();
    if (!isFormulaText(inner) && /[A-Za-z]/.test(inner)) return inner;
    return latexToUnicodeText(inner);
  });
  return rendered.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Rendered character length of an option after LaTeX/delimiter normalization. */
export function optionRenderedLength(text: string): number {
  return optionRenderedText(text).length;
}

/**
 * Deterministic option stacking predicate:
 * Stack ALL 4 options vertically (a-d) when ANY option exceeds 22 rendered chars
 * or contains a multi-line / complex mathematical expression.
 * Otherwise use the compact 2x2 grid (a & b on row 1; c & d on row 2).
 */
export function shouldStackOptions(options: string[]): boolean {
  if (!options || options.length === 0) return false;
  return options.some((opt) => {
    const clean = cleanOptionText(opt);
    return isComplexOption(clean) || optionRenderedLength(clean) > OPTION_COLUMN_BUDGET;
  });
}

export interface OptionRow {
  options: { index: number; text: string }[];
}

/**
 * Group options into rows deterministically based on the full option set (a-d):
 * - If any option > 22 rendered chars or multi-line/complex: stack all 4 vertically.
 * - Otherwise: compact 2x2 grid (a & b on row 1, c & d on row 2).
 */
export const layoutOptions = (options: string[]): OptionRow[] => {
  if (!options || options.length === 0) return [];
  const cleanOptions = options.map(cleanOptionText);

  if (shouldStackOptions(cleanOptions)) {
    return cleanOptions.map((text, index) => ({ options: [{ index, text }] }));
  }

  const rows: OptionRow[] = [];
  for (let i = 0; i < cleanOptions.length; i += 2) {
    const first = { index: i, text: cleanOptions[i] };
    if (i + 1 < cleanOptions.length) {
      rows.push({ options: [first, { index: i + 1, text: cleanOptions[i + 1] }] });
    } else {
      rows.push({ options: [first] });
    }
  }
  return rows;
};

const markWord = (marks: number): string => (marks === 1 ? 'mark' : 'marks');

/**
 * Structured marking line shown once per section, e.g.:
 *   "Each question carries 2 marks."
 *   "Attempt any 5 of the 7 questions. Each question carries 2 marks."
 * When no blueprint exists (e.g. after an AI revision) the section's own
 * questions are used and every question is attempted.
 */
export function sectionMarkingNote(
  section: PaperSection,
  blueprint?: PaperSectionBlueprint
): string {
  const perQuestion =
    blueprint?.perQuestionMarks ?? section.questions[0]?.marks ?? 1;
  const questionCount =
    blueprint?.questionCount ?? section.questions.length;
  const attemptCount = blueprint?.attemptCount ?? questionCount;

  const note = `Each question carries ${perQuestion} ${markWord(perQuestion)}.`;
  if (attemptCount >= questionCount) return note;
  return `Attempt any ${attemptCount} of the ${questionCount} questions. ${note}`;
}

/** Same note builder, driven by the paper's blueprints by section index. */
export const paperSectionNote = (
  paper: GeneratedPaper,
  sectionIndex: number,
  section: PaperSection
): string => sectionMarkingNote(section, paper.sectionBlueprints?.[sectionIndex]);

/**
 * The AI's generic instruction line, unless it already repeats the marking
 * rule ("... carries N marks." / "Attempt any ...") — that line is printed
 * deterministically from the blueprint instead, so it can never be missing.
 */
export const sectionInstruction = (section: PaperSection): string =>
  /mark/i.test(section.instruction) || /attempt any/i.test(section.instruction)
    ? ''
    : section.instruction;

/** Marks actually earned by a full attempt of this section. */
export function sectionAttemptMarks(
  section: PaperSection,
  blueprint?: PaperSectionBlueprint
): number {
  const perQuestion =
    blueprint?.perQuestionMarks ?? section.questions[0]?.marks ?? 0;
  const attemptCount = blueprint?.attemptCount ?? section.questions.length;
  return perQuestion * attemptCount;
}

/** True when a section's questions should display option rows (MCQs). */
export const hasOptions = (question: PaperQuestion): boolean =>
  question.type === 'mcq' && !!question.options && question.options.length > 0;

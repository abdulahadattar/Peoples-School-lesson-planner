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
import { MATH_REGEX } from './mathDetection';

/** Hollow circle students fill in to mark their chosen option. */
export const OPTION_CIRCLE = '\u25CB';

/** Character budget for one option column (circle + letter + text). */
const OPTION_COLUMN_BUDGET = 48;

/** Question number shown on the paper, e.g. index 0 -> "Q1". */
export const questionNumber = (index: number): string => `Q${index + 1}`;

/** Lowercase letter for an option index: 0 -> "a", 1 -> "b", ... */
export const optionLetter = (index: number): string => String.fromCharCode(97 + index);

/** Rendered text label for an option: "○ a) ". */
export const optionPrefix = (index: number): string => `${OPTION_CIRCLE} ${optionLetter(index)}) `;

/**
 * Strips AI-generated question numbering, prefixes, and trailing mark labels.
 * E.g.:
 *  - "1. What is pressure?" -> "What is pressure?"
 *  - "Q1: State Newton's first law." -> "State Newton's first law."
 *  - "Question 2. Define acceleration (2 Marks)" -> "Define acceleration"
 *  - "(i) Calculate velocity" -> "Calculate velocity"
 */
export function cleanQuestionText(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip Markdown bold wrappers around question numbering like "**Question 1:**", "**1.**", "**Q1.**"
  cleaned = cleaned.replace(/^\*\*(?:Question\s*\d+|Q\s*\d+|\d+)\s*[:.)-]?\*\*\s*/i, '');
  cleaned = cleaned.replace(/^\*(?:Question\s*\d+|Q\s*\d+|\d+)\s*[:.)-]?\*\s*/i, '');

  // Strip leading question labels like "Question 1:", "Q1.", "Q1:", "1.", "1)", "(1)", "(i)", "i."
  cleaned = cleaned.replace(/^(?:Question\s*\d+\s*[:.)-]?|Q\s*\d+\s*[:.)-]?|\d+\s*[:.)-]\s*|\(\d+\)\s*|\([a-zA-Z0-9ivxlcdm]+\)\s*|[a-zA-Z0-9ivxlcdm]+\s*[:.)-]\s*)/i, '');

  // Strip trailing marks annotations like "(2 Marks)", "[4 marks]", "(1 Mark)", "--- 2 Marks", "(2M)"
  cleaned = cleaned.replace(/\s*(?:[\(\[\{]\s*\d+\s*(?:marks?|mark|m)\s*[\)\]\}]|\s*[-–—]\s*\d+\s*(?:marks?|mark|m))\s*$/i, '');

  // Strip wrapping quotes if any
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '');

  return cleaned.trim();
}

/**
 * Strips AI-generated option prefixes (A, B, C, D, circles, etc.) from an option string.
 * E.g.:
 *  - "A) 12 m/s" -> "12 m/s"
 *  - "(b) 24 m/s" -> "24 m/s"
 *  - "C. 36 m/s" -> "36 m/s"
 *  - "○ D) 48 m/s" -> "48 m/s"
 *  - "Option A: 10 m/s" -> "10 m/s"
 */
export function cleanOptionText(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip leading "○ a) ", "• A) ", "Option A: ", "(A) ", "A) ", "A. ", "1) ", "(1) ", "[A] "
  cleaned = cleaned.replace(/^(?:[○•\-\*]\s*)?(?:\([a-dA-D1-4]\)|[a-dA-D1-4]\s*[\)\.:\-–]|Option\s+[a-dA-D1-4]\s*[:.)\-–]|\[[a-dA-D1-4]\])\s*/i, '');

  // Strip wrapping quotes if any
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '');

  return cleaned.trim();
}

/** Full display line for an option (clean prefix + clean text). */
export const optionLine = (index: number, text: string): string => {
  const clean = cleanOptionText(text);
  return `${optionPrefix(index)}${clean}`;
};

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
  } else {
    options = undefined;
  }

  return {
    ...q,
    question: cleanedText,
    options,
  };
}

/** Estimate of the on-page width of an option's plain text (equations are wide). */
const plainTextLength = (text: string): number => {
  // Equation delimiters expand to wide rendered images — treat them as long
  MATH_REGEX.lastIndex = 0;
  if (MATH_REGEX.test(text)) return Number.MAX_SAFE_INTEGER;
  return text.length;
};

export interface OptionRow {
  options: { index: number; text: string }[];
}

/**
 * Group options into rows of one or two:
 * two options share a row when BOTH comfortably fit a half-width column,
 * otherwise each long option gets its own full-width row.
 */
export const layoutOptions = (options: string[]): OptionRow[] => {
  const rows: OptionRow[] = [];
  const cleanOptions = options.map(cleanOptionText);
  let i = 0;
  while (i < cleanOptions.length) {
    const first = { index: i, text: cleanOptions[i] };
    if (i + 1 < cleanOptions.length && plainTextLength(first.text) <= OPTION_COLUMN_BUDGET) {
      const second = { index: i + 1, text: cleanOptions[i + 1] };
      if (plainTextLength(second.text) <= OPTION_COLUMN_BUDGET) {
        rows.push({ options: [first, second] });
        i += 2;
        continue;
      }
    }
    rows.push({ options: [first] });
    i += 1;
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

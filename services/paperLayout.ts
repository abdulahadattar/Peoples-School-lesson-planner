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

/** Full display line for an option (prefix + text). */
export const optionLine = (index: number, text: string): string => `${optionPrefix(index)}${text}`;

/** Estimate of the on-page width of an option's plain text (equations are wide). */
const plainTextLength = (text: string): number => {
  // Equation delimiters expand to wide rendered images — treat them as long
  const withEquations = text.match(/\$\$[\s\S]*?\$\$|\$(?!\s)(?:[^$\\]|\\.)+?\$/g);
  if (withEquations) return Number.MAX_SAFE_INTEGER;
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
  let i = 0;
  while (i < options.length) {
    const first = { index: i, text: options[i] };
    if (i + 1 < options.length && plainTextLength(first.text) <= OPTION_COLUMN_BUDGET) {
      const second = { index: i + 1, text: options[i + 1] };
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

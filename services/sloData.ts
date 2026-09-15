/**
 * sloData.ts — one loader for the curriculum SLO JSON files
 * (public/curriculum/slos/Grade N/<subject>.json).
 *
 * Curriculum subject ids (curriculum/subjects/*.ts) don't always match the
 * SLO filenames (e.g. subject id "math" vs file "mathematics.json") —
 * SUBJECT_FILE_ALIASES maps id -> filename so every subject's SLOs and
 * textbook PDF are actually reachable.
 *
 * Every caller that needs a chapter's SLOs or its textbook PDF URL goes
 * through loadSloChapter, so the path / grade / chapter-number conversions
 * live in exactly one place. (They previously lived in five, which is how
 * the lesson-plan and exam-paper flows ended up fetching the same file with
 * subtly different paths and casing.)
 */

/**
 * Map curriculum subject ids to their SLO JSON filenames when they differ
 * (the files live under public/curriculum/slos/Grade N/).
 */
const SUBJECT_FILE_ALIASES: Record<string, string> = {
  math: 'mathematics',
};

export interface SloChapter {
  chapter_number: number;
  chapter_name: string;
  pdf_url?: string;
  slos?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Load one chapter from the SLO JSON for a class/subject.
 *
 * @param classId   curriculum class id, e.g. "class9"
 * @param subjectId curriculum subject id, e.g. "biology"
 * @param chapterId curriculum chapter id, e.g. "ch1"
 * @returns the chapter object (with .slos and .pdf_url), or null when the
 *          file or chapter is missing (never throws).
 */
export async function loadSloChapter(
  classId: string,
  subjectId: string,
  chapterId: string
): Promise<SloChapter | null> {
  try {
    const gradeNum = parseInt(classId.replace('class', ''), 10);
    const grade = `Grade ${gradeNum}`;
    const chapterNum = parseInt(chapterId.replace('ch', ''), 10);
    const file = SUBJECT_FILE_ALIASES[subjectId.toLowerCase()] ?? subjectId.toLowerCase();
    const response = await fetch(`/curriculum/slos/${grade}/${file}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.chapters?.find((c: { chapter_number: number }) => c.chapter_number === chapterNum) || null;
  } catch {
    return null;
  }
}
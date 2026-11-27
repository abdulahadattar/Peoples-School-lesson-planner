/**
 * curriculumFallback.ts — Synthesizes syllabus-aligned SLOs and topic guidance
 * when a chapter has no uploaded PDF or sparse/empty JSON SLOs.
 */
import { curriculumData } from '../../curriculum';

export interface FallbackSloItem {
  uniqueId: string;
  SLO_ID: string;
  SLO_Text: string;
  Cognitive_Level_Code: 'K' | 'U' | 'A';
}

function getCurriculumNames(gradeId: string, subjectId: string, chapterId: string) {
  const cls = curriculumData.classes.find((c) => c.id === gradeId);
  const subject = cls?.subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((ch) => ch.id === chapterId);
  return {
    gradeName: cls?.name || gradeId,
    subjectName: subject?.name || subjectId,
    chapterName: chapter?.name || chapterId,
    existingSlos: chapter?.slos || [],
  };
}

function getBoardLabel(gradeId: string): string {
  const num = parseInt(gradeId.replace(/\D/g, ''), 10);
  if (!Number.isNaN(num) && num >= 9) {
    return 'Ziauddin University Examination Board (ZUEB) & Sindh Textbook Board (STBB)';
  }
  return 'Sindh Textbook Board (STBB)';
}

function subjectSpecificAngle(subjectName: string, chapterName: string): string[] {
  const lower = subjectName.toLowerCase();
  if (lower.includes('math')) {
    return [
      `Define core terms, notations, and properties introduced in ${chapterName}`,
      `Solve step-by-step numerical and algebraic problems from ${chapterName} with standard methods`,
      `Apply concepts of ${chapterName} to real-life word problems and verify solutions`,
    ];
  }
  if (lower.includes('physics') || lower.includes('chemistry') || lower.includes('biology') || lower.includes('science')) {
    return [
      `Explain fundamental principles, definitions, and scientific laws in ${chapterName}`,
      `Identify key structures, phenomena, or laboratory examples related to ${chapterName}`,
      `Solve conceptual, analytical, or formula-based problems from ${chapterName}`,
    ];
  }
  if (lower.includes('computer') || lower.includes('ict')) {
    return [
      `Identify key computing components, terminology, and workflows covered in ${chapterName}`,
      `Explain practical operations, logic steps, or safe usage rules in ${chapterName}`,
      `Apply ${chapterName} concepts to solve real-world digital and problem-solving tasks`,
    ];
  }
  if (lower.includes('english') || lower.includes('urdu') || lower.includes('sindhi') || lower.includes('library')) {
    return [
      `Demonstrate comprehension of central themes, key details, and vocabulary in ${chapterName}`,
      `Apply grammar rules, sentence structures, and literary devices relevant to ${chapterName}`,
      `Compose clear, coherent responses, summaries, or creative paragraphs on ${chapterName}`,
    ];
  }
  if (lower.includes('islamiat') || lower.includes('islamiyat')) {
    return [
      `Recall key Quranic teachings, Hadith references, and historical facts from ${chapterName}`,
      `Explain the moral values and practical significance of ${chapterName} in daily life`,
      `Reflect on real-life character building and civic duties derived from ${chapterName}`,
    ];
  }
  if (lower.includes('art')) {
    return [
      `Recognize visual elements, principles of design, and materials in ${chapterName}`,
      `Explain techniques for shading, proportion, pattern construction, or color harmony in ${chapterName}`,
      `Apply creative observation skills to plan or critique artwork in ${chapterName}`,
    ];
  }
  if (lower.includes('p.e')) {
    return [
      `Identify core rules, techniques, and fitness principles related to ${chapterName}`,
      `Explain health, nutrition, posture, and injury-prevention practices in ${chapterName}`,
      `Apply teamwork, sportsmanship, and warm-up routines to school sports scenarios`,
    ];
  }
  return [
    `Recall key historical, geographic, civic, or foundational facts in ${chapterName}`,
    `Explain cause-and-effect relationships and main concepts covered in ${chapterName}`,
    `Analyze real-world Pakistani and community examples related to ${chapterName}`,
  ];
}

export function buildFallbackCurriculumSlos(
  gradeId: string,
  subjectId: string,
  chapterId: string,
  subjectNameOverride?: string,
  chapterNameOverride?: string
): FallbackSloItem[] {
  const names = getCurriculumNames(gradeId, subjectId, chapterId);
  const subjectName = subjectNameOverride || names.subjectName;
  const chapterName = chapterNameOverride || names.chapterName;
  const gradeName = names.gradeName;

  if (names.existingSlos.length > 0) {
    return names.existingSlos.map((s, idx) => ({
      uniqueId: `${gradeId}-${subjectId}-${chapterId}-slo-${idx}`,
      SLO_ID: s.id || `SLO_${idx + 1}`,
      SLO_Text: s.text,
      Cognitive_Level_Code: 'U',
    }));
  }

  const angles = subjectSpecificAngle(subjectName, chapterName);
  const cleanTag = `${subjectId.toUpperCase()}_${chapterId.toUpperCase()}`;
  const levels: Array<'K' | 'U' | 'A'> = ['K', 'U', 'A'];

  const items: FallbackSloItem[] = angles.map((text, idx) => ({
    uniqueId: `fallback-${gradeId}-${subjectId}-${chapterId}-${idx + 1}`,
    SLO_ID: `${cleanTag}_SLO_${idx + 1}`,
    SLO_Text: `${text} (${gradeName} ${subjectName}).`,
    Cognitive_Level_Code: levels[idx % levels.length],
  }));

  items.push({
    uniqueId: `fallback-${gradeId}-${subjectId}-${chapterId}-4`,
    SLO_ID: `${cleanTag}_SLO_4`,
    SLO_Text: `Evaluate and connect concepts of ${chapterName} to textbook exercises and board-style questions for ${gradeName}.`,
    Cognitive_Level_Code: 'A',
  });

  return items;
}

export function buildNoPdfSyllabusGuidance(
  gradeId: string,
  subjectId: string,
  chapterId: string,
  subjectName?: string,
  chapterName?: string
): string {
  const names = getCurriculumNames(gradeId, subjectId, chapterId);
  const resolvedSubject = subjectName || names.subjectName;
  const resolvedChapter = chapterName || names.chapterName;
  const board = getBoardLabel(gradeId);
  const fallbackSlos = buildFallbackCurriculumSlos(gradeId, subjectId, chapterId, resolvedSubject, resolvedChapter);

  return [
    `No external PDF textbook attachment is required for this paper.`,
    `Generate syllabus-accurate ${names.gradeName} ${resolvedSubject} questions aligned with ${board} standards for chapter "${resolvedChapter}".`,
    `Cover definitions, conceptual reasoning, textbook-standard problems/examples, and balanced Bloom's levels (Knowledge, Understanding, Application) matching these learning targets:`,
    ...fallbackSlos.map((s) => `- ${s.SLO_ID}: ${s.SLO_Text}`),
  ].join('\n');
}

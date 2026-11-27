import { curriculumData } from '../../curriculum';
import teachersJson from '../../data/teachers.json';
import {
  classesForTeacher,
  subjectsForTeacher,
  autoSelectForTeacher,
  resolveTeacher,
  sectionToClassId,
} from '../../services/teacherRoster';
import {
  buildFallbackCurriculumSlos,
  buildNoPdfSyllabusGuidance,
} from '../../services/paper/curriculumFallback';
import {
  isGemmaModel,
  isModelOrSchemaFallbackError,
  buildSdkModelPayload,
  sanitizeSdkCallForModel,
  buildRestModelBody,
} from '../../services/gemini/gemmaCompat';
import {
  collectServerGeminiKeys,
  ServerKeyRotator,
} from '../../services/gemini/serverKeyRotator';
import {
  normalizeMcqQuestion,
  normalizeGeneratedPaper,
  mergeChunkedPaperParts,
} from '../../services/paper/paperNormalization';
import type { Teacher } from '../../types';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

const teachers = (teachersJson as { teachers: Teacher[] }).teachers;
const classes = curriculumData.classes;

export function runPaperMatrixAndFallbackTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('paper.teacherClassSubjectMatrix (exhaustive)');
  it('maps every teacher -> every assigned class -> every assigned subject with valid chapters & fallback SLOs', () => {
    let comboCount = 0;
    for (const teacher of teachers) {
      const assignedClasses = classesForTeacher(classes, teacher);
      eq(
        assignedClasses.length > 0,
        true,
        `Teacher ${teacher.name} (${teacher.id}) resolved to 0 curriculum classes`
      );

      const auto = autoSelectForTeacher(teacher, classes, '');
      if (assignedClasses.length === 1 || teacher.subjects.length === 1) {
        eq(Boolean(auto.classId), true, `autoSelect failed classId for ${teacher.name}`);
      }
      if (teacher.subjects.length === 1) {
        eq(Boolean(auto.subjectId), true, `autoSelect failed subjectId for ${teacher.name}`);
      }

      for (const cls of assignedClasses) {
        const validSubjects = subjectsForTeacher(classes, cls.id, teacher);
        eq(
          validSubjects.length > 0,
          true,
          `Teacher ${teacher.name} in ${cls.name} (${cls.id}) has 0 matched curriculum subjects`
        );

        for (const sub of validSubjects) {
          eq(
            Array.isArray(sub.chapters) && sub.chapters.length > 0,
            true,
            `Subject ${sub.name} in ${cls.id} has no chapters`
          );
          const firstCh = sub.chapters[0];
          const slos = buildFallbackCurriculumSlos(cls.id, sub.id, firstCh.id, sub.name, firstCh.name);
          eq(slos.length >= 1, true, `No SLOs produced for ${teacher.name} / ${cls.id} / ${sub.id}`);
          const guidance = buildNoPdfSyllabusGuidance(cls.id, sub.id, firstCh.id, sub.name, firstCh.name);
          eq(guidance.includes(sub.name) || guidance.includes(firstCh.name), true);
          comboCount++;
        }
      }
    }
    eq(comboCount >= 50, true, `Expected >= 50 teacher/class/subject combinations, saw ${comboCount}`);
  });

  it('correctly resolves section & subject edge cases fixed in roster/curriculum', () => {
    eq(sectionToClassId('V-B'), 'class5');
    eq(sectionToClassId('VII-A'), 'class7');
    eq(sectionToClassId('VIII-A'), 'class8');
    eq(resolveTeacher('ICT', 'IV-A', teachers)?.name, 'Sir Faizan Shaikh');
    eq(resolveTeacher('ICT', 'V-B', teachers)?.name, 'Sir Faizan Shaikh');
    eq(resolveTeacher('Sindhi', 'VI-A', teachers)?.name, 'Miss Aneela');
    eq(resolveTeacher('Asan Urdu', 'X-A', teachers)?.name, "Ma'am Arsala");
    eq(resolveTeacher('Urdu', 'VII-A', teachers)?.name, 'Sir Feroz');
    eq(resolveTeacher('Art', 'V-A', teachers)?.name, 'Miss Shagufta');
  });

  describe('gemini.gemmaCompat & keyRotator');
  it('folds instructions & schema cleanly for Gemma and triggers fallback on HTTP 400 schema errors', () => {
    eq(isGemmaModel('gemma-4-26b-a4b-it'), true);
    eq(isGemmaModel('gemini-3.5-flash-lite'), false);

    eq(isModelOrSchemaFallbackError(400, 'JSON mode is not enabled for this model'), true);
    eq(isModelOrSchemaFallbackError(400, 'Developer instruction is not enabled for models/gemma-4-26b-a4b-it'), true);
    eq(isModelOrSchemaFallbackError(404, 'Model not found'), true);
    eq(isModelOrSchemaFallbackError(400, 'API key not valid'), false);

    const gemmaSdk = buildSdkModelPayload(
      'gemma-4-26b-a4b-it',
      'Be an examiner',
      'Make 5 MCQs',
      { type: 'object', properties: { title: { type: 'string' } } },
      0.2
    );
    eq('systemInstruction' in gemmaSdk.config, false);
    eq('responseSchema' in gemmaSdk.config, false);
    eq('responseMimeType' in gemmaSdk.config, false);
    eq(String(gemmaSdk.contents[0]).includes('Be an examiner'), true);
    eq(String(gemmaSdk.contents[0]).includes('Make 5 MCQs'), true);

    const sanitized = sanitizeSdkCallForModel(
      'models/gemma-4-26b-a4b-it',
      ['User prompt'],
      { systemInstruction: 'Sys rule', responseSchema: { type: 'object' }, responseMimeType: 'application/json', temperature: 0.3 }
    );
    eq('systemInstruction' in sanitized.config, false);
    eq('responseSchema' in sanitized.config, false);
    eq(String(sanitized.contents[0]).includes('Sys rule'), true);

    const restBody = buildRestModelBody('gemma-4-26b-a4b-it', 'Sys', 'Prompt', { type: 'object' }, 0.2);
    eq('systemInstruction' in restBody, false);
    eq('responseSchema' in restBody.generationConfig, false);
  });

  it('collects env keys, rotates round-robin, and handles transient/permanent cooldowns', () => {
    const fakeKeyA = 'AIzaSyTestKeyAAAAAAAAAAAAAAAAAAAA1111';
    const fakeKeyB = 'AIzaSyTestKeyBBBBBBBBBBBBBBBBBBBB2222';
    const fakeKeyC = 'AIzaSyTestKeyCCCCCCCCCCCCCCCCCCCC3333';
    const keys = collectServerGeminiKeys({
      GEMINI_API_KEY: fakeKeyA,
      GOOGLE_API_KEY: `${fakeKeyB}, ${fakeKeyC}`,
      GEMINI_API_KEY_1: fakeKeyA, // duplicate should dedupe
      VITE_API_KEY: '[REDACTED]', // placeholder skipped
    });
    eq(keys, [fakeKeyA, fakeKeyB, fakeKeyC]);

    const rotator = new ServerKeyRotator();
    const firstOrder = rotator.getCandidateOrder(keys, 1000);
    eq(firstOrder[0], fakeKeyA);
    const secondOrder = rotator.getCandidateOrder(keys, 1001);
    eq(secondOrder[0], fakeKeyB);

    rotator.recordFailure(fakeKeyA, 429, 'RESOURCE_EXHAUSTED quota exceeded', 2000);
    eq(rotator.isInCooldown(fakeKeyA, 3000), true);
    const cooledOrder = rotator.getCandidateOrder(keys, 3000);
    eq(cooledOrder.includes(fakeKeyA), false);

    // Recovers after 90s transient window
    eq(rotator.isInCooldown(fakeKeyA, 95000), false);
    rotator.recordFailure(fakeKeyB, 403, 'API key reported as leaked', 96000);
    eq(rotator.isInCooldown(fakeKeyB, 200000), true);
  });

  describe('paper.paperNormalization');
  it('normalizes 4-option MCQs, cleans option prefixes, and merges 40-MCQ chunked papers cleanly', () => {
    const mcq = normalizeMcqQuestion(
      {
        id: '',
        type: 'mcq',
        question: '1. SI unit of force?',
        options: ['A) Newton', 'B) Joule', 'C) Watt', 'D) Pascal'],
        marks: 1,
        correctAnswer: 'Newton',
      },
      0,
      1
    );
    eq(mcq.options, ['Newton', 'Joule', 'Watt', 'Pascal']);
    eq(mcq.correctAnswer, 'A');

    const rawPaper = JSON.stringify({
      title: 'Physics Weekly',
      sections: [
        {
          title: 'Section A (MCQs)',
          instruction: 'Choose correct',
          questions: [mcq],
        },
        {
          title: 'Section B (Short Questions)',
          instruction: 'Attempt 3',
          questions: [
            { id: 's1', type: 'short', question: 'Define momentum.', marks: 3 },
            { id: 's2', type: 'short', question: 'Define impulse.', marks: 3 },
            { id: 's3', type: 'short', question: 'State Newton second law.', marks: 3 },
          ],
        },
      ],
    });

    const counts = {
      mcqCount: 40,
      mcqMarksPerQuestion: 1,
      shortQuestionCount: 3,
      shortAttemptCount: 3,
      shortMarksPerQuestion: 3,
      longQuestionCount: 0,
      longAttemptCount: 0,
      longMarksPerQuestion: 0,
      gradeName: 'Grade 9',
      subjectName: 'Physics',
      chapterName: 'Dynamics',
      totalMarks: 49,
      durationMinutes: 60,
    };

    const norm = normalizeGeneratedPaper(rawPaper, counts);
    eq(norm.sections.length, 2);
    eq(norm.totalMarks, 49);

    const fortyMcqs = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i + 1}`,
      type: 'mcq' as const,
      question: `Question ${i + 1}?`,
      options: ['A) One', 'B) Two', 'C) Three', 'D) Four'],
      marks: 1,
      correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
    }));

    const merged = mergeChunkedPaperParts(fortyMcqs, [norm.sections[1]], counts);
    eq(merged.sections[0].questions.length, 40);
    eq(merged.sections[1].questions.length, 3);
    eq(merged.sectionBlueprints?.[0].questionCount, 40);
  });
}

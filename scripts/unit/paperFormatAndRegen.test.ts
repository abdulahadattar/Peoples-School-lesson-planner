import type { GeneratedPaper } from '../../types';
import {
  PAPER_PRESETS,
  balanceSectionsForTotalMarks,
  getPresetsForFormat,
} from '../../services/paper/paperFormatPresets';
import {
  addQuestionToPaper,
  applyQuestionUpdateToPaper,
  removeQuestionFromPaper,
} from '../../services/paper/paperEdits';
import { registerOmrTestFromPaper, getOmrTestByCode } from '../../services/omr/testRegistry';
import { regenerateSingleQuestion } from '../../services/paper/singleQuestionRegenerator';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runPaperFormatAndRegenTests(h: Harness): Promise<void> {
  const { describe, it, itAsync, eq } = h;

  describe('paper.formatsPresetsAndBalancing');
  it('ensures every Full, Section A+B, and MCQ-Only preset matches exact totalMarks math', () => {
    eq(getPresetsForFormat('full').length >= 3, true);
    eq(getPresetsForFormat('section_ab').length >= 3, true);
    eq(getPresetsForFormat('mcq_only').length >= 3, true);

    for (const preset of PAPER_PRESETS) {
      const calcTotal =
        preset.mcq * preset.mcqMarks +
        preset.shortAttempt * preset.shortMarks +
        preset.longAttempt * preset.longMarks;
      eq(calcTotal, preset.total, `Preset ${preset.id} math mismatch`);
      eq(preset.shortAttempt <= preset.shortCount, true);
      eq(preset.longAttempt <= preset.longCount, true);
    }

    for (const [fmt, target] of [
      ['full', 75],
      ['full', 60],
      ['section_ab', 40],
      ['mcq_only', 25],
    ] as const) {
      const balanced = balanceSectionsForTotalMarks(fmt, target);
      eq(balanced.totalMarks, target, `${fmt} target ${target}`);
      if (fmt === 'mcq_only') {
        eq(balanced.shortQuestionCount, 0);
        eq(balanced.longQuestionCount, 0);
      } else if (fmt === 'section_ab') {
        eq(balanced.shortQuestionCount > 0, true);
        eq(balanced.longQuestionCount, 0);
      } else {
        eq(balanced.shortQuestionCount > 0, true);
        eq(balanced.longQuestionCount > 0, true);
      }
    }
  });

  describe('paper.liveOmrKeyAndBlueprintSync');
  it('synchronizes totalMarks, blueprints, and OMR answer key across add/edit/delete', () => {
    const store = new Map<string, string>();
    const prevLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };

    try {
      const basePaper: GeneratedPaper = {
        title: 'Physics Full Exam',
        gradeLevel: 'Grade 9',
        subject: 'Physics',
        chapterName: 'Kinematics',
        totalMarks: 10,
        durationMinutes: 60,
        sections: [
          {
            title: 'Section A — Multiple Choice Questions (MCQs)',
            instruction: 'All questions compulsory.',
            questions: [
              { id: 'm1', type: 'mcq', question: 'Q1', options: ['a', 'b', 'c', 'd'], correctAnswer: 'B', marks: 1 },
              { id: 'm2', type: 'mcq', question: 'Q2', options: ['a', 'b', 'c', 'd'], correctAnswer: 'D', marks: 1 },
            ],
          },
          {
            title: 'Section B — Short Questions',
            instruction: 'Attempt any 2 of 3 questions.',
            questions: [
              { id: 's1', type: 'short', question: 'Define speed.', marks: 4 },
              { id: 's2', type: 'short', question: 'Define velocity.', marks: 4 },
              { id: 's3', type: 'short', question: 'Define acceleration.', marks: 4 },
            ],
          },
        ],
        sectionBlueprints: [
          { questionCount: 2, attemptCount: 2, perQuestionMarks: 1 },
          { questionCount: 3, attemptCount: 2, perQuestionMarks: 4 },
        ],
        omrMeta: {
          enabled: true,
          testCode: 'PHYIX-SYNC1',
          testNumber: 'Test #01',
          testDate: '2026-11-27',
          testFrequency: 'monthly',
        },
      };

      registerOmrTestFromPaper(basePaper, { paperSnapshot: basePaper });
      eq(getOmrTestByCode('PHYIX-SYNC1')?.answerKey, 'BD');

      const withAddedMcq = addQuestionToPaper(basePaper, 0, 'new3');
      eq(withAddedMcq.sections[0].questions.length, 3);
      eq(withAddedMcq.sections[0].questions[2].correctAnswer, 'A');
      eq(withAddedMcq.totalMarks, 11);
      registerOmrTestFromPaper(withAddedMcq, { paperSnapshot: withAddedMcq });
      eq(getOmrTestByCode('PHYIX-SYNC1')?.answerKey, 'BDA');
      eq(getOmrTestByCode('PHYIX-SYNC1')?.questionCount, 3);

      const edited = applyQuestionUpdateToPaper(withAddedMcq, 0, 1, {
        ...withAddedMcq.sections[0].questions[1],
        correctAnswer: 'C',
      });
      registerOmrTestFromPaper(edited, { paperSnapshot: edited });
      eq(getOmrTestByCode('PHYIX-SYNC1')?.answerKey, 'BCA');

      const removed = removeQuestionFromPaper(edited, 0, 0);
      registerOmrTestFromPaper(removed, { paperSnapshot: removed });
      eq(removed.totalMarks, 10);
      eq(getOmrTestByCode('PHYIX-SYNC1')?.answerKey, 'CA');
      eq(getOmrTestByCode('PHYIX-SYNC1')?.questionCount, 2);
    } finally {
      if (prevLocalStorage === undefined) delete (globalThis as any).localStorage;
      else (globalThis as any).localStorage = prevLocalStorage;
    }
  });

  describe('paper.singleQuestionRegenerationContext');
  await itAsync('passes entire paper exclusion list and chapter context when regenerating a question', async () => {
    const origFetch = globalThis.fetch;
    const origLocalStorage = (globalThis as any).localStorage;
    const origSessionStorage = (globalThis as any).sessionStorage;
    let capturedPrompt = '';

    const makeStorageMock = (store: Record<string, string>) => ({
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    });

    (globalThis as any).localStorage = makeStorageMock({ gemini_api_key: 'test-offline-mock-key' });
    (globalThis as any).sessionStorage = makeStorageMock({});
    (globalThis as any).fetch = async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com') || u.includes('/api/gemini/generate')) {
        capturedPrompt = String(init?.body || '');
        const mockQuestion = {
          question: 'Which law relates net force to rate of change of momentum?',
          options: ["Newton's first law", "Newton's second law", "Newton's third law", 'Law of gravitation'],
          correctAnswer: 'B',
        };
        return new Response(
          JSON.stringify({
            text: JSON.stringify(mockQuestion),
            candidates: [{ content: { parts: [{ text: JSON.stringify(mockQuestion) }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('', { status: 404 });
    };

    try {
      const paper: GeneratedPaper = {
        title: 'Physics Dynamics Exam',
        gradeLevel: 'Grade 9',
        subject: 'Physics',
        chapterName: 'Dynamics',
        totalMarks: 7,
        durationMinutes: 45,
        sections: [
          {
            title: 'Section A — MCQs',
            instruction: 'All compulsory.',
            questions: [
              { id: 'q1', type: 'mcq', question: 'What is SI unit of force?', options: ['N', 'J', 'W', 'Pa'], correctAnswer: 'A', marks: 1 },
              { id: 'q2', type: 'mcq', question: 'Which property resists change in motion?', options: ['Mass', 'Speed', 'Area', 'Time'], correctAnswer: 'A', marks: 1 },
            ],
          },
          {
            title: 'Section B — Short Questions',
            instruction: 'All compulsory.',
            questions: [
              { id: 'q3', type: 'short', question: 'State law of conservation of linear momentum.', marks: 5 },
            ],
          },
        ],
      };

      const replacement = await regenerateSingleQuestion(paper, paper.sections[0].questions[0]);
      eq(replacement.id, 'q1');
      eq(replacement.type, 'mcq');
      eq(replacement.marks, 1);
      eq(replacement.correctAnswer, 'B');
      eq(replacement.options?.length, 4);
      eq(capturedPrompt.includes('Which property resists change in motion?'), true);
      eq(capturedPrompt.includes('State law of conservation of linear momentum.'), true);
      eq(capturedPrompt.includes('DO NOT DUPLICATE'), true);
    } finally {
      globalThis.fetch = origFetch;
      (globalThis as any).localStorage = origLocalStorage;
      (globalThis as any).sessionStorage = origSessionStorage;
    }
  });
}

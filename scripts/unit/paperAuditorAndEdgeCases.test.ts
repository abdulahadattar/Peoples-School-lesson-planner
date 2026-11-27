/**
 * paperAuditorAndEdgeCases.test.ts — Pure-logic unit tests for exam paper
 * normalization, prefix safety, LaTeX/chemistry parsing, DOCX ZIP extraction,
 * PDF + Word build inspection, deterministic quality rules, and the bounded
 * multi-pass PDF + Word AI Auditor loop.
 */
import type { GeneratedPaper } from '../../types';
import {
  cleanOptionText,
  cleanQuestionText,
  parseMcqAnswerKey,
  shouldStackOptions,
} from '../../services/paperLayout';
import { latexToUnicodeText, sanitizeMathText } from '../../services/latexSanitizer';
import { expandChemInKatexLatex } from '../../services/chemFormula';
import { parseTextToRichParts } from '../../services/export/inlineMathParser';
import {
  normalizeMcqQuestion,
  normalizeRevisedPaper,
} from '../../services/paper/paperNormalization';
import {
  applyPaperAuditFixes,
  runDeterministicPaperAudit,
} from '../../services/paper/paperQualityRules';
import { inspectPaperBuilds } from '../../services/paper/buildInspector';
import { auditAndRefinePaper } from '../../services/paper/paperAuditor';
import { cleanAndParseJson } from '../../services/jsonHelpers';
import { generateExamPaper } from '../../services/paper/generator';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

function makeSampleChemistryPaper(): GeneratedPaper {
  return {
    title: 'Chemistry Chapter 1 Test',
    gradeLevel: 'Grade IX',
    subject: 'Chemistry',
    chapterName: 'Fundamentals of Chemistry',
    totalMarks: 4,
    durationMinutes: 20,
    sections: [
      {
        title: 'Section A — Multiple Choice Questions (MCQs)',
        instruction: 'Choose the correct option.',
        questions: [
          {
            id: 'q1',
            type: 'mcq',
            marks: 1,
            question: 'What is the chemical formula of water ($\\ce{H2O}$) formed by $\\ce{2H2 + O2 -> 2H2O}$?',
            options: ['H2O2', 'H2O', 'OH-', 'HO2'],
            correctAnswer: 'A', // Deliberately wrong in draft so auditor test fixes it -> B
          },
          {
            id: 'q2',
            type: 'mcq',
            marks: 1,
            question: 'Which compound is $1\\text{-Butene}$ among these?',
            options: ['1-Butene', '2-Propanol', 'X-rays', 'C.G.S. unit'],
            correctAnswer: 'A',
          },
        ],
      },
      {
        title: 'Section B — Short Questions',
        instruction: 'Each question carries 2 marks.',
        questions: [
          {
            id: 'q3',
            type: 'short',
            marks: 2,
            question: 'Explain why $2.5\\text{ s}$ after heating, \\( CO_2 \\) turns lime water milky.',
          },
        ],
      },
    ],
    sectionBlueprints: [
      { questionCount: 2, attemptCount: 2, perQuestionMarks: 1 },
      { questionCount: 1, attemptCount: 1, perQuestionMarks: 2 },
    ],
  };
}

export async function runPaperAuditorAndEdgeCasesTests(h: Harness): Promise<void> {
  const { describe, it, itAsync, eq } = h;

  describe('paperLayout prefix cleaning edge cases');
  it('preserves decimals, hyphenated chemistry/physics terms, and abbreviations', () => {
    eq(cleanQuestionText('2.5 seconds after release, find velocity.'), '2.5 seconds after release, find velocity.');
    eq(cleanQuestionText('X-rays are electromagnetic waves.'), 'X-rays are electromagnetic waves.');
    eq(cleanQuestionText('p-n junction conducts in forward bias.'), 'p-n junction conducts in forward bias.');
    eq(cleanQuestionText('Q1. What is $v$? (1 Mark)'), 'What is $v$?');
    eq(cleanQuestionText('(ii) State Ohm law.'), 'State Ohm law.');

    eq(cleanOptionText('1-Butene'), '1-Butene');
    eq(cleanOptionText('2-Propanol'), '2-Propanol');
    eq(cleanOptionText('1:2'), '1:2');
    eq(cleanOptionText('1.5 m/s'), '1.5 m/s');
    eq(cleanOptionText('-5'), '-5');
    eq(cleanOptionText('d-orbital'), 'd-orbital');
    eq(cleanOptionText('A) 1-Butene'), '1-Butene');
    eq(cleanOptionText('○ d) 1.5 m/s'), '1.5 m/s');
  });

  it('ignores markdown bold/italic asterisks when measuring stacked option length', () => {
    const opts = ['**10 m/s**', '*20 m/s*', '**30 m/s**', '40 m/s'];
    eq(shouldStackOptions(opts), false);
  });

  describe('parseMcqAnswerKey & normalizeMcqQuestion');
  it('resolves labelled letters and full option text without corrupting keys', () => {
    const opts = ['Mass', 'Density', 'Volume', 'Force'];
    eq(parseMcqAnswerKey('Answer: D', opts).letter, 'D');
    eq(parseMcqAnswerKey('Density', opts).letter, 'B'); // Must NOT extract 'D' from "Density"!
    eq(parseMcqAnswerKey('Option 3', opts).letter, 'C');
    eq(parseMcqAnswerKey('(d)', opts).letter, 'D');

    const normalized = normalizeMcqQuestion(
      {
        id: 'm1',
        type: 'mcq',
        marks: 1,
        question: 'Which quantity equals $m/V$?',
        options: ['A) Mass', 'B) Density', 'C) Volume', 'D) Force'],
        correctAnswer: 'Density',
      },
      0,
      1
    );
    eq(normalized.correctAnswer, 'B');
    eq(normalized.options?.[1], 'Density');
  });

  describe('LaTeX, chemistry \\ce{}, and \\(...\\) sanitization');
  it('normalizes \\(...\\) / \\[...\\] and renders \\ce{...} in Unicode, KaTeX, and inline runs', () => {
    eq(sanitizeMathText('Use \\( E = mc^2 \\) and \\[ a^2 = b^2 \\]'), 'Use $E = mc^2$ and $$a^2 = b^2$$');
    eq(latexToUnicodeText('\\ce{H2O}'), 'H₂O');
    eq(latexToUnicodeText('\\ce{SO4^{2-}}'), 'SO₄²⁻');
    eq(latexToUnicodeText('\\ce{2H2 + O2 -> 2H2O}'), '2H₂ + O₂ → 2H₂O');
    eq(latexToUnicodeText('\\left. x \\right.'), 'x');
    eq(latexToUnicodeText('P \\implies Q'), 'P ⇒ Q');
    eq(expandChemInKatexLatex('\\ce{H2O}').includes('_{2}'), true);
    const expandedArrow = expandChemInKatexLatex('\\ce{2H2 + O2 -> 2H2O}');
    eq(expandedArrow.includes('\\rightarrow'), true);
    eq(expandedArrow.includes('\\mathrm{rightarrow}'), false);
    const expandedEqArrow = expandChemInKatexLatex('\\ce{CO2 + H2O <=> H2CO3}');
    eq(expandedEqArrow.includes('\\rightleftharpoons'), true);
    eq(expandedEqArrow.includes('\\mathrm{rightleftharpoons}'), false);

    const rich = parseTextToRichParts('Formula $\\ce{H2O}$ is neutral');
    eq(rich.length, 1);
    eq(rich[0].kind, 'runs');
    if (rich[0].kind === 'runs') {
      eq(rich[0].runs.some((r) => r.sub && r.text === '2'), true);
    }

    const bareRich = parseTextToRichParts('\\ce{H2O}');
    eq(bareRich.length, 1);
    eq(bareRich[0].kind, 'runs');
    if (bareRich[0].kind === 'runs') {
      eq(bareRich[0].runs.some((r) => r.sub && r.text === '2'), true);
    }
  });

  describe('normalizeRevisedPaper blueprint & mark sync');
  it('reconstructs sectionBlueprints and recalculates totalMarks after revisions', () => {
    const base = makeSampleChemistryPaper();
    const rawRevised = JSON.stringify({
      title: 'Revised Chemistry Test',
      gradeLevel: 'Grade IX',
      subject: 'Chemistry',
      totalMarks: 999, // Deliberately stale total
      durationMinutes: 30,
      sections: [
        base.sections[0],
        {
          title: 'Section B — Short Questions',
          instruction: 'Attempt any 2 of the 3 questions. Each question carries 2 marks.',
          questions: [
            { id: 's1', type: 'short', marks: 2, question: 'Define mole.' },
            { id: 's2', type: 'short', marks: 2, question: 'Define empirical formula.' },
            { id: 's3', type: 'short', marks: 2, question: 'State Avogadro number.' },
          ],
        },
      ],
    });
    const normalized = normalizeRevisedPaper(rawRevised, base);
    eq(normalized.sectionBlueprints?.length, 2);
    eq(normalized.sectionBlueprints?.[1].questionCount, 3);
    eq(normalized.sectionBlueprints?.[1].attemptCount, 2);
    eq(normalized.totalMarks, 6); // 2*1 + 2*2
  });

  describe('deterministic paper quality audit & fix application');
  it('flags totalMarks drift, duplicates, wrong key, raw html/latex, and applies fixes cleanly', () => {
    const dirty: GeneratedPaper = {
      title: 'Physics Quiz',
      gradeLevel: 'Grade X',
      subject: 'Physics',
      chapterName: 'Kinematics',
      totalMarks: 99,
      durationMinutes: 30,
      sections: [
        {
          title: 'Section A — MCQs',
          instruction: 'All questions compulsory.',
          questions: [
            {
              id: 'q1',
              type: 'mcq',
              marks: 1,
              question: 'What is the value of $5 and gravity?',
              options: ['10 m/s^2', '10 m/s^2', '5 m/s^2', '2 m/s^2'],
              correctAnswer: 'A',
            },
            {
              id: 'q2',
              type: 'mcq',
              marks: 1,
              question: 'What is the value of $5 and gravity?',
              options: ['1 m', '2 m', '3 m', '4 m'],
              correctAnswer: 'INVALID',
            },
          ],
        },
      ],
      sectionBlueprints: [{ questionCount: 2, attemptCount: 2, perQuestionMarks: 1 }],
    };

    const det = runDeterministicPaperAudit(dirty);
    eq(det.errorCount > 0, true);
    eq(det.findings.some((f) => f.category === 'count_marks'), true);
    eq(det.findings.some((f) => f.category === 'duplicate'), true);
    eq(det.findings.some((f) => f.category === 'answer_key'), true);
    eq(det.findings.some((f) => f.category === 'latex_math'), true);

    const fixed = applyPaperAuditFixes(dirty, {
      passed: false,
      summary: 'Fixed marks and duplicate question.',
      questionFixes: [
        {
          sectionIndex: 0,
          questionIndex: 1,
          issueCategory: 'duplicate',
          reason: 'Replaced duplicate question with SI unit of force.',
          fixedQuestion: 'What is the SI unit of force?',
          fixedOptions: ['Joule', 'Newton', 'Watt', 'Pascal'],
          fixedCorrectAnswer: 'B',
        },
      ],
      layoutWarnings: [],
    });
    eq(fixed.paper.totalMarks, 2);
    eq(fixed.paper.sections[0].questions[1].correctAnswer, 'B');
    eq(fixed.paper.sections[0].questions[1].question, 'What is the SI unit of force?');
  });

  describe('DOCX + PDF build inspector (real word/document.xml extraction)');
  await itAsync('builds .docx and PDF definition, extracts OOXML paragraphs, and verifies clean parity', async () => {
    const sample = makeSampleChemistryPaper();
    const inspection = await inspectPaperBuilds(sample, { name: 'Teacher A', schoolName: 'PHSSJ' }, 85);
    eq(inspection.docxBuilt, true);
    eq(inspection.pdfBuilt, true);
    eq(inspection.docxBytesLength > 2000, true);
    eq(inspection.docxParagraphCount > 5, true);
    eq(inspection.buildFindings.length, 0);
    eq(inspection.docxInspection?.ooxmlDump.includes('H2O'), true);
    eq(inspection.docxInspection?.ooxmlDump.includes('1-Butene'), true);
    eq(inspection.pdfLayoutDump.includes('H_(2)O'), true);
    eq(inspection.docxInspection?.ooxmlDump.includes('\\ce'), false);
    eq(inspection.pdfLayoutDump.includes('\\ce'), false);
  });

  describe('closed-loop auditAndRefinePaper (PDF + Word multi-pass loop)');
  await itAsync('inspects built PDF + Word, auto-fixes wrong MCQ key & spelling, rebuilds and passes', async () => {
    const origFetch = globalThis.fetch;
    const origLocalStorage = (globalThis as any).localStorage;
    const origSessionStorage = (globalThis as any).sessionStorage;

    let callCount = 0;
    const sampleDraft = makeSampleChemistryPaper();

    const makeStorageMock = (store: Record<string, string>) => ({
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    });

    (globalThis as any).localStorage = makeStorageMock({ gemini_api_key: 'test-offline-mock-key' });
    (globalThis as any).sessionStorage = makeStorageMock({});
    (globalThis as any).fetch = async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gemini/generate') || urlStr.includes('generativelanguage.googleapis.com')) {
        callCount += 1;
        const payload = callCount === 1
          ? {
              passed: false,
              summary: 'Fixed MCQ 1 answer key to B (H2O).',
              questionFixes: [
                {
                  sectionIndex: 0,
                  questionIndex: 0,
                  issueCategory: 'answer_key',
                  reason: 'Water has chemical formula H2O (option B), not H2O2 (option A).',
                  fixedCorrectAnswer: 'B',
                },
              ],
              layoutWarnings: [],
            }
          : {
              passed: true,
              summary: 'Rebuilt PDF and Word builds verified clean.',
              questionFixes: [],
              layoutWarnings: [],
            };
        return new Response(
          JSON.stringify({
            text: JSON.stringify(payload),
            candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return origFetch(url as any);
    };

    try {
      const audited = await auditAndRefinePaper(sampleDraft, {
        teacherInfo: { name: 'Teacher A', schoolName: 'PHSSJ' },
        maxPasses: 2,
      });
      eq(callCount >= 1, true);
      eq(audited.sections[0].questions[0].correctAnswer, 'B');
      eq(audited.auditReport?.checkedDocx, true);
      eq(audited.auditReport?.checkedPdf, true);
      eq(audited.auditReport?.status, 'fixed');
      eq((audited.auditReport?.fixes.length || 0) > 0, true);
    } finally {
      globalThis.fetch = origFetch;
      (globalThis as any).localStorage = origLocalStorage;
      (globalThis as any).sessionStorage = origSessionStorage;
    }
  });

  describe('HTML endpoint guard & non-duplicate chunked retry');
  it('rejects HTML documents cleanly in cleanAndParseJson before JSON.parse', () => {
    let caught = '';
    try {
      cleanAndParseJson('<!doctype html><html><body>SPA fallback</body></html>');
    } catch (e) {
      caught = (e as Error).message;
    }
    eq(caught.includes('HTML page instead of JSON'), true);
    eq(caught.includes('Unexpected token'), false);
  });

  await itAsync('fails fast once without duplicate chunked retry when /api/gemini/generate returns HTML', async () => {
    const origFetch = globalThis.fetch;
    const origLocalStorage = (globalThis as any).localStorage;
    const origSessionStorage = (globalThis as any).sessionStorage;
    let proxyHits = 0;

    const makeEmptyStorage = () => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    });

    (globalThis as any).localStorage = makeEmptyStorage();
    (globalThis as any).sessionStorage = makeEmptyStorage();
    (globalThis as any).fetch = async (url: unknown) => {
      if (String(url).includes('/api/gemini/generate')) {
        proxyHits += 1;
        return new Response('<!doctype html><html><body>Unexpected HTML</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('', { status: 404 });
    };

    try {
      let thrown = '';
      try {
        await generateExamPaper('class9', 'physics', 'ch1', 30, 30, 0, 0, 0, 0, 45, 'medium');
      } catch (e) {
        thrown = (e as Error).message;
      }
      eq(proxyHits, 1, 'Expected single fail-fast call without burning models or duplicating chunked generation');
      eq(thrown.includes('HTML page instead of JSON'), true, thrown);
      eq(thrown.includes('Unexpected token'), false, thrown);
    } finally {
      globalThis.fetch = origFetch;
      (globalThis as any).localStorage = origLocalStorage;
      (globalThis as any).sessionStorage = origSessionStorage;
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { Packer } from 'docx';
import type { GeneratedPaper, PaperQuestion } from '../../types';
import { latexToUnicodeText } from '../latexSanitizer';
import {
  cleanQuestionText,
  cleanOptionText,
  layoutOptions,
  optionLine,
  shouldStackOptions,
} from '../paperLayout';
import { parseTextToRichParts, latexToInlineRuns } from './inlineMathParser';
import { buildExamPaperDocx, EXAM_DOCX_LAYOUT } from './docxExamPaper';
import { buildExamPaperPdfDefinition, createPaperPdfContent, EXAM_PDF_LAYOUT, renderPdfRichText } from './pdfExport';

function buildRealistic50QuestionPaper(): GeneratedPaper {
  const questions: PaperQuestion[] = [];
  for (let i = 0; i < 50; i++) {
    if (i === 0) {
      // Malformed duplicate phrase + inline units & angles
      questions.push({
        id: `q_${i + 1}`,
        type: 'mcq',
        marks: 1,
        question: 'A particle travels $10\\text{ m}$ at $45^\\circ$ for $3\\text{ s}$ before in before $10\\text{ m/s}$ becomes $20\\text{ m/s}$.',
        options: ['$6\\text{ m}$', '$8\\text{ m}$', '$10\\text{ m}$', '$12\\text{ m}$'],
        correctAnswer: 'C',
      });
    } else if (i % 4 === 1) {
      // Short inline velocity/time/superscript expressions (<= 22 chars -> 2x2 grid)
      questions.push({
        id: `q_${i + 1}`,
        type: 'mcq',
        marks: 1,
        question: `Object ${i + 1} moves with initial speed $u = 10\\text{ m/s}$ and accelerates at $a = 2\\text{ m/s}^2$ for $5\\text{ s}$ to reach $100\\text{ m/s}$.`,
        options: ['$10\\text{ m/s}$', '$20\\text{ m/s}$', '$50\\text{ m/s}$', '$100\\text{ m/s}$'],
        correctAnswer: 'B',
      });
    } else if (i % 4 === 2) {
      // Long sentence options (> 22 chars -> all 4 stacked vertically)
      questions.push({
        id: `q_${i + 1}`,
        type: 'mcq',
        marks: 1,
        question: `In scenario ${i + 1}, when net external force on a system is zero and mass is $10^{-3}\\text{ kg}$, what happens to momentum $p = mv$?`,
        options: [
          'It remains strictly constant throughout the motion',
          'It increases linearly with time',
          'It drops to zero',
          'Short option',
        ],
        correctAnswer: 'A',
      });
    } else if (i % 4 === 3) {
      // Complex fractional option -> all 4 stacked vertically
      questions.push({
        id: `q_${i + 1}`,
        type: 'mcq',
        marks: 1,
        question: `Which expression represents kinetic energy for mass $m$ moving at speed $v_0$?`,
        options: ['$\\frac{1}{2}mv_0^2$', '$mv_0^2$', '$2mv_0^2$', '$\\frac{1}{4}mv_0^2$'],
        correctAnswer: 'A',
      });
    } else {
      // Angles & chemical/unit inline symbols (<= 22 chars -> 2x2 grid)
      questions.push({
        id: `q_${i + 1}`,
        type: 'mcq',
        marks: 1,
        question: `A projectile launched at $45^\\circ$ covers $8\\text{ m}$ horizontally while water $H_2O$ boils at $100^\\circ\\text{C}$.`,
        options: ['A) 30°', 'B) 45°', 'C) 60°', 'D) 90°'],
        correctAnswer: 'B',
      });
    }
  }

  return {
    title: 'Physics Comprehensive Assessment',
    gradeLevel: 'Grade IX',
    subject: 'Physics',
    chapterName: 'Kinematics & Dynamics',
    totalMarks: 50,
    durationMinutes: 60,
    sections: [
      {
        title: 'Section A — Multiple Choice Questions (MCQs)',
        instruction: 'Choose the correct option.',
        questions,
      },
    ],
    sectionBlueprints: [{ questionCount: 50, attemptCount: 50, perQuestionMarks: 1 }],
  };
}

test('latexToUnicodeText handles angles, units, spacing commands, and subscripts cleanly', () => {
  assert.equal(latexToUnicodeText('45^\\circ'), '45°');
  assert.equal(latexToUnicodeText('45^{\\circ}'), '45°');
  assert.equal(latexToUnicodeText('10\\text{ m/s}'), '10 m/s');
  assert.equal(latexToUnicodeText('10\\,\\text{m}'), '10 m');
  assert.equal(latexToUnicodeText('10\\text{ m/s}^2'), '10 m/s²');
  assert.equal(latexToUnicodeText('H_2O'), 'H₂O');
});

test('inlineMathParser keeps all inline units, angles, symbols, and sub/superscripts inline', () => {
  const sentence = 'Moves $10\\text{ m}$, $6\\text{ m}$, $8\\text{ m}$ at $45^\\circ$ from $10\\text{ m/s}$ in $5\\text{ s}$ to $100\\text{ m/s}$ with $10^{-3}\\text{ kg}$ and $v_0$.';
  const parts = parseTextToRichParts(sentence, { mode: 'inline-all' });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].kind, 'runs');
  const joined = parts[0].runs.map((r) => r.text).join('');
  assert.ok(joined.includes('10 m, 6 m, 8 m at 45° from 10 m/s in 5 s to 100 m/s'));
  assert.ok(parts[0].runs.some((r) => r.sup && r.text === '-3'));
  assert.ok(parts[0].runs.some((r) => r.sub && r.text === '0'));

  // Mid-sentence single-line $$...$$ is demoted inline in default mode; multi-line blocks, matrices, or complex-as-equation mode emit equations
  const demotedInlineParts = parseTextToRichParts('Compute $$\\frac{a}{b}$$ then continue.');
  assert.equal(demotedInlineParts.length, 1);
  assert.equal(demotedInlineParts[0].kind, 'runs');

  const displayParts = parseTextToRichParts('Compute:\n$$\n\\frac{a}{b}\n$$\nthen continue.');
  assert.equal(displayParts.length, 3);
  assert.equal(displayParts[1].kind, 'equation');

  const matrixParts = parseTextToRichParts('Compute $$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$$ then continue.');
  assert.equal(matrixParts.length, 3);
  assert.equal(matrixParts[1].kind, 'equation');

  const complexDocxParts = parseTextToRichParts('Compute $\\frac{a}{b}$ then continue.', { mode: 'complex-as-equation' });
  assert.equal(complexDocxParts.length, 3);
  assert.equal(complexDocxParts[1].kind, 'equation');

  assert.deepEqual(latexToInlineRuns('45^\\circ'), [{ text: '45°' }]);
});

test('cleanQuestionText repairs malformed duplicate phrasing while preserving valid idioms', () => {
  const dirty = 'Q1. A car travels 3 s before in before 10 m/s and stops in in 5 s. (1 Mark)';
  const once = cleanQuestionText(dirty);
  assert.equal(once, 'A car travels 3 s before 10 m/s and stops in 5 s.');
  assert.equal(cleanQuestionText(once), once);

  assert.equal(cleanQuestionText('Solve step by step using Newton laws.'), 'Solve step by step using Newton laws.');
  assert.equal(cleanOptionText('  a)   10 m/s  '), '10 m/s');
  assert.equal(optionLine(1, 'B)20 m/s'), '○ b) 20 m/s');
});

test('layoutOptions applies deterministic 22-char & complexity rules across all 4 options', () => {
  // Compact inline unit options (<= 22 rendered chars) -> 2x2 grid
  const shortUnits = ['$6\\text{ m}$', '$8\\text{ m}$', '$10\\text{ m/s}$', '$100\\text{ m/s}$'];
  assert.equal(shouldStackOptions(shortUnits), false);
  const shortRows = layoutOptions(shortUnits);
  assert.equal(shortRows.length, 2);
  assert.equal(shortRows[0].options.length, 2);
  assert.equal(shortRows[1].options.length, 2);

  // Even ONE option > 22 rendered chars stacks ALL 4 vertically
  const oneLong = ['10 m', '20 m', 'It remains strictly constant throughout', '40 m'];
  assert.equal(shouldStackOptions(oneLong), true);
  const stackedRows = layoutOptions(oneLong);
  assert.equal(stackedRows.length, 4);
  for (const row of stackedRows) {
    assert.equal(row.options.length, 1);
  }

  // Complex \frac expression stacks ALL 4 vertically
  const complexOpts = ['$\\frac{1}{2}mv^2$', '$mv^2$', '$2mv^2$', '$4mv^2$'];
  assert.equal(shouldStackOptions(complexOpts), true);
  assert.equal(layoutOptions(complexOpts).length, 4);
});

test('DOCX export for 50-MCQ paper produces valid OOXML with exact 0.35"/3.65" tabs, stacked hanging indents, keepNext, and native inline math', async () => {
  const paper = buildRealistic50QuestionPaper();
  const doc = await buildExamPaperDocx(paper, { name: 'A. Khan', schoolName: 'PHSSJ' }, 85);
  const buffer = await Packer.toBuffer(doc);
  assert.ok(buffer.byteLength > 5000);

  const zip = new AdmZip(buffer);
  const docXml = zip.readAsText('word/document.xml');
  assert.ok(docXml.length > 0);

  // Clean A4 margins between 0.35" (504) and 0.5" (720)
  assert.ok(docXml.includes('w:top="504"') && docXml.includes('w:left="576"') && docXml.includes('w:right="576"'));

  // Inline units & angles stay native text (no drawing images for simple units, no duplicate "before in before")
  assert.ok(docXml.includes('10 m/s'));
  assert.ok(docXml.includes('45°'));
  assert.ok(!docXml.includes('before in before'));
  assert.ok(!docXml.includes('<w:drawing>'), 'Simple inline expressions and headless fallback must not emit raster drawings');

  // Native Word superscript / subscript present for m/s^2 and v_0
  assert.ok(docXml.includes('w:val="superscript"'));
  assert.ok(docXml.includes('w:val="subscript"'));

  // Exact 2x2 geometry: left 0.35" (504) + left tab stop 3.65" (5256) + real <w:tab/>
  assert.ok(docXml.includes(`w:left="${EXAM_DOCX_LAYOUT.LEFT_INDENT_TWIPS}"`));
  assert.ok(docXml.includes(`w:pos="${EXAM_DOCX_LAYOUT.RIGHT_COL_TAB_TWIPS}"`));
  assert.ok(docXml.includes('<w:tab/>'));

  // Exact stacked geometry: 0.35" + 0.22" hanging (left=821, hanging=317) + spacing after=55
  assert.ok(
    docXml.includes(
      `w:left="${EXAM_DOCX_LAYOUT.STACKED_LEFT_TWIPS}"`
    ) && docXml.includes(`w:hanging="${EXAM_DOCX_LAYOUT.STACKED_HANGING_TWIPS}"`)
  );
  assert.ok(docXml.includes(`w:after="${EXAM_DOCX_LAYOUT.STACKED_AFTER_TWIPS}"`));

  // Question stems keepNext so stems do not orphan from options
  assert.ok(docXml.includes('<w:keepNext/>'));
});

test('PDF definition for 50-MCQ paper keeps inline math inline, uses compact margins, unbreakable questions, and fixed 0.35"/3.65" columns', async () => {
  const paper = buildRealistic50QuestionPaper();

  // Single inline sentence with many inline math fragments must produce ONE text node (no image line breaks)
  const items = await renderPdfRichText(
    'Q1. Move $10\\text{ m}$ at $45^\\circ$ with $10\\text{ m/s}$ for $5\\text{ s}$ to $100\\text{ m/s}$ and $v_0 = 0$.',
    'questionText'
  );
  assert.equal(items.length, 1);
  assert.ok(Array.isArray(items[0].text));
  assert.equal(items[0].image, undefined);

  const def = await buildExamPaperPdfDefinition(paper, { name: 'A. Khan', schoolName: 'PHSSJ' }, 85);
  // Margins inside 0.35"-0.5" (25.2pt - 36pt)
  for (const m of def.pageMargins) {
    assert.ok(m >= 25 && m <= 36, `PDF margin ${m}pt outside 0.35"-0.5" range`);
  }

  const content = await createPaperPdfContent(paper);
  const questionStacks = content.filter((node: any) => node && node.unbreakable === true && Array.isArray(node.stack));
  // 1 section header stack + 50 question stacks = 51 unbreakable blocks
  assert.equal(questionStacks.length, 51);

  // Verify Q1 (compact options) uses 2x2 columns at 25.2pt + 237.6pt (starts col2 at 262.8pt = 3.65")
  const q1Stack = questionStacks[1].stack;
  const q1Row1 = q1Stack[1];
  assert.equal(q1Row1.columns[0].width, EXAM_PDF_LAYOUT.LEFT_INDENT_PT);
  assert.equal(q1Row1.columns[1].width, EXAM_PDF_LAYOUT.COL1_WIDTH_PT);
  assert.equal(q1Row1.columns.length, 3);

  // Verify Q3 (long option > 22 chars) stacks all 4 options vertically
  const q3Stack = questionStacks[3].stack;
  const q3OptionRows = q3Stack.slice(1);
  assert.equal(q3OptionRows.length, 4);
  for (const row of q3OptionRows) {
    assert.equal(row.columns.length, 2);
    assert.equal(row.columns[0].width, EXAM_PDF_LAYOUT.LEFT_INDENT_PT);
  }
});

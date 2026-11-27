/**
 * paperQualityRules.ts — Deterministic quality, accuracy, formatting, math, and
 * structure checks + safe fix application helpers for exam papers.
 */
import {
  GeneratedPaper,
  PaperAuditFixRecord,
  PaperAuditIssueCategory,
  PaperQuestion,
} from '../../types';
import {
  cleanOptionText,
  cleanQuestionText,
  parseMcqAnswerKey,
  sanitizeSingleQuestion,
} from '../paperLayout';
import { isFormulaText, MATH_REGEX } from '../mathDetection';
import { sanitizeMathText, sanitizeStringFields } from '../latexSanitizer';
import { computeEffectivePaperMarks } from './paperEdits';
import { normalizeQuestionKey } from './paperNormalization';

export interface DeterministicFinding {
  category: PaperAuditIssueCategory;
  severity: 'error' | 'warning';
  location: string;
  sectionIndex?: number;
  questionIndex?: number;
  message: string;
  autoFixable: boolean;
}

export interface DeterministicAuditResult {
  findings: DeterministicFinding[];
  errorCount: number;
  warningCount: number;
}

export interface PaperAuditQuestionFix {
  sectionIndex: number;
  questionIndex: number;
  issueCategory: PaperAuditIssueCategory;
  reason: string;
  fixedQuestion?: string;
  fixedOptions?: string[];
  fixedCorrectAnswer?: 'A' | 'B' | 'C' | 'D';
}

export interface PaperAuditModelPayload {
  passed: boolean;
  summary: string;
  headerFix?: {
    title?: string;
    sectionFixes?: { sectionIndex: number; title?: string; instruction?: string }[];
  };
  questionFixes: PaperAuditQuestionFix[];
  layoutWarnings: string[];
}

const RAW_LATEX_LEAK_RE = /\\(?:frac|dfrac|tfrac|sqrt|ce|alpha|beta|gamma|theta|pi|rho|sigma|omega|Delta|Sigma|sum|int|times|div|rightarrow|leftarrow|rightleftharpoons|implies|iff|text|mathrm)\b/;
const RAW_HTML_ENTITY_RE = /(?:&amp;|&lt;|&gt;|&nbsp;|<\/?(?:p|div|br|b|i|span|strong|em)\b[^>]*>)/i;
const GARBAGE_TOKEN_RE = /\b(?:undefined|NaN|null)\b|\[object Object\]/i;
const TRUNCATED_ENDING_RE = /(?:\.\.\.|,\s*$|\b(?:the|an?|of|to|in|on|at|for|with|and|or|but|from|into|by|is|are|was|were|which|that)\s*)$/i;

/** Check a single rendered string (prose or math) for leaked LaTeX/HTML/delimiters/truncation. */
export function scanTextForArtifacts(text: string): string[] {
  const issues: string[] = [];
  if (!text || !text.trim()) return issues;

  if (GARBAGE_TOKEN_RE.test(text)) {
    issues.push('Contains an invalid placeholder word (undefined/NaN/null).');
  }
  if (RAW_HTML_ENTITY_RE.test(text)) {
    issues.push('Contains raw HTML tags or escaped entities.');
  }
  if (/\\\(|\\\[|\\ce\{/.test(text)) {
    issues.push('Contains unconverted LaTeX delimiters or chemistry notation.');
  }

  let prose = text;
  MATH_REGEX.lastIndex = 0;
  prose = prose.replace(MATH_REGEX, (tok) => {
    const inner = tok.startsWith('$$') ? tok.slice(2, -2) : tok.slice(1, -1);
    if (!isFormulaText(inner) && /[A-Za-z]/.test(inner)) {
      issues.push(`Plain word wrapped in math delimiters: "${inner}"`);
    }
    return ' [MATH] ';
  });

  if (prose.includes('$')) {
    issues.push('Has an unmatched "$" math symbol.');
  }
  if (RAW_LATEX_LEAK_RE.test(prose)) {
    issues.push('Has unformatted math command outside delimiters.');
  }
  return issues;
}

function hasUnbalancedDelimiters(text: string): boolean {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (const ch of text) {
    if (ch === '(') round += 1;
    else if (ch === ')') round -= 1;
    else if (ch === '[') square += 1;
    else if (ch === ']') square -= 1;
    else if (ch === '{') curly += 1;
    else if (ch === '}') curly -= 1;
    if (round < -1 || square < -1 || curly < -1) return true;
  }
  return round !== 0 || square !== 0 || curly !== 0;
}

/**
 * Inspect a GeneratedPaper deterministically for structural, math, key, option,
 * duplicate, and truncation issues before and after exports are built.
 */
export function runDeterministicPaperAudit(paper: GeneratedPaper): DeterministicAuditResult {
  const findings: DeterministicFinding[] = [];
  const seenQuestions = new Map<string, string>();

  if (!paper.title?.trim()) {
    findings.push({
      category: 'formatting_layout',
      severity: 'error',
      location: 'Header',
      message: 'Paper title is missing.',
      autoFixable: true,
    });
  }

  const effectiveMarks = computeEffectivePaperMarks(paper);
  if (effectiveMarks > 0 && paper.totalMarks !== effectiveMarks) {
    findings.push({
      category: 'count_marks',
      severity: 'error',
      location: 'Header',
      message: `Total marks (${paper.totalMarks}) does not match section sum (${effectiveMarks}).`,
      autoFixable: true,
    });
  }

  (paper.sections || []).forEach((section, sIdx) => {
    const bp = paper.sectionBlueprints?.[sIdx];
    const qCount = section.questions?.length || 0;
    const secLabel = `Section ${sIdx + 1}`;

    if (qCount === 0) {
      findings.push({
        category: 'formatting_layout',
        severity: 'error',
        location: secLabel,
        sectionIndex: sIdx,
        message: `${secLabel} has no questions.`,
        autoFixable: false,
      });
    }

    if (bp && (bp.questionCount !== qCount || bp.attemptCount > qCount)) {
      findings.push({
        category: 'count_marks',
        severity: 'warning',
        location: secLabel,
        sectionIndex: sIdx,
        message: `${secLabel} question count (${qCount}) differs from blueprint (${bp.questionCount}).`,
        autoFixable: true,
      });
    }

    (section.questions || []).forEach((q, qIdx) => {
      const loc = `${secLabel} Q${qIdx + 1}`;
      const stem = (q.question || '').trim();

      if (stem.length < 6) {
        findings.push({
          category: 'spelling_grammar',
          severity: 'error',
          location: loc,
          sectionIndex: sIdx,
          questionIndex: qIdx,
          message: 'Question text is missing or too short.',
          autoFixable: false,
        });
      } else {
        if (cleanQuestionText(stem) !== stem) {
          findings.push({
            category: 'formatting_layout',
            severity: 'warning',
            location: loc,
            sectionIndex: sIdx,
            questionIndex: qIdx,
            message: 'Question text has leftover numbering, mark tag, or spacing glitch.',
            autoFixable: true,
          });
        }
        if (TRUNCATED_ENDING_RE.test(stem) && !stem.endsWith('?') && !stem.endsWith('.')) {
          findings.push({
            category: 'spelling_grammar',
            severity: 'error',
            location: loc,
            sectionIndex: sIdx,
            questionIndex: qIdx,
            message: 'Question appears cut off mid-sentence.',
            autoFixable: false,
          });
        }
        if (hasUnbalancedDelimiters(stem)) {
          findings.push({
            category: 'formatting_layout',
            severity: 'warning',
            location: loc,
            sectionIndex: sIdx,
            questionIndex: qIdx,
            message: 'Question has unmatched parentheses or brackets.',
            autoFixable: false,
          });
        }
      }

      for (const art of scanTextForArtifacts(stem)) {
        findings.push({
          category: 'latex_math',
          severity: 'warning',
          location: loc,
          sectionIndex: sIdx,
          questionIndex: qIdx,
          message: art,
          autoFixable: true,
        });
      }

      const normStem = normalizeQuestionKey(stem);
      if (normStem.length >= 12) {
        const prevLoc = seenQuestions.get(normStem);
        if (prevLoc) {
          findings.push({
            category: 'duplicate',
            severity: 'error',
            location: loc,
            sectionIndex: sIdx,
            questionIndex: qIdx,
            message: `Duplicates question in ${prevLoc}.`,
            autoFixable: false,
          });
        } else {
          seenQuestions.set(normStem, loc);
        }
      }

      if (q.type === 'mcq') {
        const opts = Array.isArray(q.options) ? q.options : [];
        if (opts.length !== 4) {
          findings.push({
            category: 'count_marks',
            severity: 'error',
            location: loc,
            sectionIndex: sIdx,
            questionIndex: qIdx,
            message: `MCQ has ${opts.length} options instead of 4.`,
            autoFixable: false,
          });
        }

        const optSeen = new Set<string>();
        opts.forEach((opt, oIdx) => {
          const clean = cleanOptionText(opt);
          if (!clean) {
            findings.push({
              category: 'formatting_layout',
              severity: 'error',
              location: `${loc} (${String.fromCharCode(97 + oIdx)})`,
              sectionIndex: sIdx,
              questionIndex: qIdx,
              message: 'Empty MCQ option.',
              autoFixable: false,
            });
          } else {
            if (clean !== opt.trim()) {
              findings.push({
                category: 'formatting_layout',
                severity: 'warning',
                location: `${loc} (${String.fromCharCode(97 + oIdx)})`,
                sectionIndex: sIdx,
                questionIndex: qIdx,
                message: 'Option has a redundant A/B/C/D prefix.',
                autoFixable: true,
              });
            }
            const optKey = normalizeQuestionKey(clean) || clean.toLowerCase();
            if (optSeen.has(optKey)) {
              findings.push({
                category: 'duplicate',
                severity: 'error',
                location: `${loc} (${String.fromCharCode(97 + oIdx)})`,
                sectionIndex: sIdx,
                questionIndex: qIdx,
                message: `Duplicate MCQ choice "${clean}".`,
                autoFixable: false,
              });
            }
            optSeen.add(optKey);
            for (const art of scanTextForArtifacts(clean)) {
              findings.push({
                category: 'latex_math',
                severity: 'warning',
                location: `${loc} (${String.fromCharCode(97 + oIdx)})`,
                sectionIndex: sIdx,
                questionIndex: qIdx,
                message: art,
                autoFixable: true,
              });
            }
          }
        });

        const parsedKey = parseMcqAnswerKey(q.correctAnswer, opts);
        if (!q.correctAnswer || parsedKey.resolvedFrom === 'default') {
          const explicit = /^[A-D]$/i.test(String(q.correctAnswer || '').trim());
          if (!explicit) {
            findings.push({
              category: 'answer_key',
              severity: 'error',
              location: loc,
              sectionIndex: sIdx,
              questionIndex: qIdx,
              message: 'Missing or ambiguous MCQ answer key.',
              autoFixable: false,
            });
          }
        }
      }
    });
  });

  return {
    findings,
    errorCount: findings.filter((f) => f.severity === 'error').length,
    warningCount: findings.filter((f) => f.severity === 'warning').length,
  };
}

/** Apply deterministic cleanup across all sections & questions cleanly. */
export function applyDeterministicCleanup(paper: GeneratedPaper): {
  paper: GeneratedPaper;
  fixes: PaperAuditFixRecord[];
} {
  const next: GeneratedPaper = JSON.parse(JSON.stringify(paper));
  const fixes: PaperAuditFixRecord[] = [];

  next.sections = (next.sections || []).map((sec, sIdx) => {
    const cleanSecTitle = sanitizeMathText(sec.title || '').trim();
    const cleanSecInst = sanitizeMathText(sec.instruction || '').trim();
    const questions = (sec.questions || []).map((q, qIdx) => {
      const beforeJson = JSON.stringify(q);
      const mathClean = sanitizeStringFields(q) as PaperQuestion;
      const singleClean = sanitizeSingleQuestion(mathClean);

      if (singleClean.type === 'mcq' && Array.isArray(singleClean.options)) {
        const cleanOpts = singleClean.options.map(cleanOptionText);
        const keyInfo = parseMcqAnswerKey(q.correctAnswer ?? singleClean.correctAnswer, cleanOpts);
        singleClean.options = cleanOpts;
        singleClean.correctAnswer = keyInfo.letter;
      }

      if (JSON.stringify(singleClean) !== beforeJson) {
        fixes.push({
          sectionIndex: sIdx,
          questionNumber: qIdx + 1,
          category: 'formatting_layout',
          reason: `Section ${sIdx + 1} Q${qIdx + 1}: Cleaned math formatting, prefixes, or spacing.`,
          applied: true,
        });
      }
      return singleClean;
    });

    if (next.sectionBlueprints?.[sIdx]) {
      next.sectionBlueprints[sIdx].questionCount = questions.length;
      next.sectionBlueprints[sIdx].attemptCount = Math.min(
        next.sectionBlueprints[sIdx].attemptCount,
        questions.length
      );
    }

    return {
      ...sec,
      title: cleanSecTitle || sec.title,
      instruction: cleanSecInst || sec.instruction,
      questions,
    };
  });

  const computedMarks = computeEffectivePaperMarks(next);
  if (computedMarks > 0 && next.totalMarks !== computedMarks) {
    fixes.push({
      category: 'count_marks',
      reason: `Paper Header: Synced total marks from ${next.totalMarks} to ${computedMarks}.`,
      applied: true,
    });
    next.totalMarks = computedMarks;
  }

  return { paper: next, fixes };
}

/** Apply structured AI Auditor fixes immutably with full re-sanitization. */
export function applyPaperAuditFixes(
  paper: GeneratedPaper,
  payload: PaperAuditModelPayload
): { paper: GeneratedPaper; appliedFixes: PaperAuditFixRecord[] } {
  const next: GeneratedPaper = JSON.parse(JSON.stringify(paper));
  const appliedFixes: PaperAuditFixRecord[] = [];

  if (payload.headerFix?.title && payload.headerFix.title.trim()) {
    const cleanTitle = sanitizeMathText(payload.headerFix.title.trim());
    if (cleanTitle && cleanTitle !== next.title) {
      next.title = cleanTitle;
      appliedFixes.push({
        category: 'formatting_layout',
        reason: 'Paper Header: Refined paper title.',
        applied: true,
      });
    }
  }

  for (const secFix of payload.headerFix?.sectionFixes || []) {
    const sec = next.sections?.[secFix.sectionIndex];
    if (!sec) continue;
    if (secFix.title?.trim() && secFix.title.trim() !== sec.title) {
      sec.title = sanitizeMathText(secFix.title.trim());
      appliedFixes.push({
        sectionIndex: secFix.sectionIndex,
        category: 'formatting_layout',
        reason: `Section ${secFix.sectionIndex + 1}: Refined section heading.`,
        applied: true,
      });
    }
    if (secFix.instruction?.trim() && secFix.instruction.trim() !== sec.instruction) {
      sec.instruction = sanitizeMathText(secFix.instruction.trim());
      appliedFixes.push({
        sectionIndex: secFix.sectionIndex,
        category: 'formatting_layout',
        reason: `Section ${secFix.sectionIndex + 1}: Updated section instruction.`,
        applied: true,
      });
    }
  }

  for (const fix of payload.questionFixes || []) {
    const sec = next.sections?.[fix.sectionIndex];
    const targetQ = sec?.questions?.[fix.questionIndex];
    if (!sec || !targetQ) continue;

    const updated: PaperQuestion = { ...targetQ };
    let changed = false;

    if (fix.fixedQuestion && fix.fixedQuestion.trim()) {
      const sanitizedStem = cleanQuestionText(sanitizeMathText(fix.fixedQuestion.trim()));
      if (sanitizedStem && sanitizedStem !== updated.question) {
        updated.question = sanitizedStem;
        changed = true;
      }
    }

    if (updated.type === 'mcq') {
      if (Array.isArray(fix.fixedOptions) && fix.fixedOptions.length === 4) {
        const cleanedOpts = fix.fixedOptions.map((o) => cleanOptionText(sanitizeMathText(String(o || ''))));
        if (cleanedOpts.every(Boolean)) {
          if (JSON.stringify(cleanedOpts) !== JSON.stringify(updated.options)) {
            updated.options = cleanedOpts;
            changed = true;
          }
        }
      }
      if (fix.fixedCorrectAnswer && /^[A-D]$/i.test(fix.fixedCorrectAnswer.trim())) {
        const nextKey = fix.fixedCorrectAnswer.trim().toUpperCase() as 'A' | 'B' | 'C' | 'D';
        if (nextKey !== updated.correctAnswer) {
          updated.correctAnswer = nextKey;
          changed = true;
        }
      }
    }

    if (changed) {
      sec.questions[fix.questionIndex] = sanitizeSingleQuestion(updated);
      appliedFixes.push({
        sectionIndex: fix.sectionIndex,
        questionNumber: fix.questionIndex + 1,
        category: fix.issueCategory || 'spelling_grammar',
        reason: `Section ${fix.sectionIndex + 1} Q${fix.questionIndex + 1}: ${fix.reason || 'Corrected question wording or answer key.'}`,
        applied: true,
      });
    }
  }

  const cleanup = applyDeterministicCleanup(next);
  return {
    paper: cleanup.paper,
    appliedFixes: [...appliedFixes, ...cleanup.fixes],
  };
}

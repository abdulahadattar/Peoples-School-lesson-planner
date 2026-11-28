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
import { demoteInlineDisplayMath, sanitizeMathText, sanitizeStringFields } from '../latexSanitizer';
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
const GARBAGE_TOKEN_RE = /\b(?:undefined|NaN)\b|\[object Object\]|\bnull\b(?!\s+(?:set|vector|space|matrix|hypothesis|point|pointer))/i;
const TRUNCATED_ENDING_RE = /(?:\.\.\.|,\s*$|\b(?:the|an?|of|to|in|on|at|for|with|and|or|but|from|into|by|is|are|was|were|which|that)\s*)$/i;
const MCQ_TRUNCATED_ENDING_RE = /(?:\.\.\.|,\s*$|\b(?:the|an?|and|or|but|which|that)\s*)$/i;
const LANGUAGE_SCRIPT_SUBJECT_RE = /\b(urdu|sindhi|islamiat|islamic\s+studies|arabic|persian|nazra)\b/i;
const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const FOREIGN_SCRIPT_OR_MOJIBAKE_RE = /[\u0400-\u04FF\u0590-\u05FF\u0900-\u097F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\uFFFD\u2580-\u259F]/;

export interface TextArtifactFinding {
  message: string;
  category: PaperAuditIssueCategory;
  severity: 'error' | 'warning';
  autoFixable: boolean;
}

export function isScriptAllowedForSubject(subject?: string): boolean {
  return Boolean(subject && LANGUAGE_SCRIPT_SUBJECT_RE.test(subject));
}

export function detectUnexpectedScriptBleed(text: string, subject?: string): string | null {
  if (!text) return null;
  if (FOREIGN_SCRIPT_OR_MOJIBAKE_RE.test(text)) {
    const match = text.match(FOREIGN_SCRIPT_OR_MOJIBAKE_RE)?.[0] || '';
    return `Contains corrupted or foreign characters ("${match}").`;
  }
  if (!isScriptAllowedForSubject(subject) && ARABIC_SCRIPT_RE.test(text)) {
    const sample = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/)?.[0] || '';
    return `Contains unexpected non-English script characters ("${sample}").`;
  }
  return null;
}

function detectBrokenLatexSyntax(latex: string): string | null {
  let curly = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '{') curly += 1;
    else if (ch === '}') curly -= 1;
    if (curly < 0) return 'Math formula has an extra closing brace "}".';
  }
  if (curly !== 0) return 'Math formula has an unclosed "{" brace.';

  let lrDepth = 0;
  const lrRe = /\\(left|right)(?![A-Za-z])/g;
  let lrMatch: RegExpExecArray | null;
  while ((lrMatch = lrRe.exec(latex)) !== null) {
    lrDepth += lrMatch[1] === 'left' ? 1 : -1;
    if (lrDepth < 0) return 'Math formula has a misplaced \\right delimiter.';
  }
  if (lrDepth !== 0) return 'Math formula has an unclosed \\left delimiter.';

  if (/[_^]\s*$/.test(latex)) return 'Math formula ends with an incomplete superscript/subscript.';
  return null;
}

/** Check a single rendered string (prose or math) with severity & repair classification. */
export function scanTextQuality(text: string, subject?: string): TextArtifactFinding[] {
  const issues: TextArtifactFinding[] = [];
  if (!text || !text.trim()) return issues;

  const bleed = detectUnexpectedScriptBleed(text, subject);
  if (bleed) {
    issues.push({
      message: bleed,
      category: 'spelling_grammar',
      severity: 'error',
      autoFixable: false,
    });
  }

  if (GARBAGE_TOKEN_RE.test(text)) {
    issues.push({
      message: 'Contains an invalid placeholder word (undefined/NaN/null).',
      category: 'spelling_grammar',
      severity: 'error',
      autoFixable: false,
    });
  }
  if (RAW_HTML_ENTITY_RE.test(text)) {
    issues.push({
      message: 'Contains raw HTML tags or escaped entities.',
      category: 'formatting_layout',
      severity: 'error',
      autoFixable: false,
    });
  }
  if (/\\\(|\\\[/.test(text)) {
    issues.push({
      message: 'Contains unconverted LaTeX delimiters.',
      category: 'latex_math',
      severity: 'error',
      autoFixable: true,
    });
  }

  let prose = text;
  MATH_REGEX.lastIndex = 0;
  prose = prose.replace(MATH_REGEX, (tok) => {
    const inner = tok.startsWith('$$') ? tok.slice(2, -2).trim() : tok.slice(1, -1).trim();
    if (!isFormulaText(inner) && /[A-Za-z]/.test(inner)) {
      issues.push({
        message: `Plain word wrapped in math delimiters: "${inner}"`,
        category: 'latex_math',
        severity: 'warning',
        autoFixable: true,
      });
    } else {
      const broken = detectBrokenLatexSyntax(inner);
      if (broken) {
        issues.push({
          message: broken,
          category: 'latex_math',
          severity: 'error',
          autoFixable: false,
        });
      }
    }
    return ' [MATH] ';
  });

  if (prose.includes('$')) {
    issues.push({
      message: 'Has an unmatched "$" math symbol.',
      category: 'latex_math',
      severity: 'error',
      autoFixable: true,
    });
  }
  if (RAW_LATEX_LEAK_RE.test(prose)) {
    issues.push({
      message: 'Has unformatted math command outside delimiters.',
      category: 'latex_math',
      severity: 'error',
      autoFixable: true,
    });
  }
  return issues;
}

/** Check a single rendered string (prose or math) for leaked LaTeX/HTML/delimiters/truncation. */
export function scanTextForArtifacts(text: string, subject?: string): string[] {
  return scanTextQuality(text, subject).map((i) => i.message);
}

function hasUnbalancedDelimiters(text: string): boolean {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
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
        const truncRe = q.type === 'mcq' ? MCQ_TRUNCATED_ENDING_RE : TRUNCATED_ENDING_RE;
        if (truncRe.test(stem) && !stem.endsWith('?') && !stem.endsWith('.') && !stem.endsWith(':')) {
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

      for (const art of scanTextQuality(stem, paper.subject)) {
        findings.push({
          category: art.category,
          severity: art.severity,
          location: loc,
          sectionIndex: sIdx,
          questionIndex: qIdx,
          message: art.message,
          autoFixable: art.autoFixable,
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
            const optKey = clean
              .toLowerCase()
              .replace(/\$+/g, '')
              .replace(/\\(?:left|right)\s*/g, '')
              .replace(/\s+/g, '')
              .trim();
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
            for (const art of scanTextQuality(clean, paper.subject)) {
              findings.push({
                category: art.category,
                severity: art.severity,
                location: `${loc} (${String.fromCharCode(97 + oIdx)})`,
                sectionIndex: sIdx,
                questionIndex: qIdx,
                message: art.message,
                autoFixable: art.autoFixable,
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
      mathClean.question = demoteInlineDisplayMath(mathClean.question || '', false);
      if (Array.isArray(mathClean.options)) {
        mathClean.options = mathClean.options.map((opt) => demoteInlineDisplayMath(String(opt || ''), true));
      }
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

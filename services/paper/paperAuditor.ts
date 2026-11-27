/**
 * paperAuditor.ts — Closed-loop PDF + Word (.docx) Exam Paper Auditor.
 *
 * After an exam paper is generated or revised, builds BOTH the real PDF and
 * Word (.docx) files, attaches the rendered PDF binary + Word page visuals +
 * OOXML word/document.xml layout dump + PDF structure summary + Answer Key,
 * asks a multimodal Gemini reviewer to inspect layout, formatting, spelling,
 * facts, math equations, and every MCQ answer key, applies any returned fixes
 * deterministically, rebuilds both files, and re-verifies in a bounded loop.
 */
import { Part } from '@google/genai';
import {
  GeneratedPaper,
  PaperAuditFixRecord,
  PaperAuditReport,
  TeacherInfo,
} from '../../types';
import { LogCallback, MODEL_CHAIN } from '../gemini/types';
import { isGemmaModel } from '../gemini/gemmaCompat';
import { requestJsonWithRetry } from '../gemini/client';
import { cleanAndParseJson } from '../jsonHelpers';
import { paperAuditSchema } from './auditSchema';
import { inspectPaperBuilds, PaperBuildInspection } from './buildInspector';
import { isPdfContextRejection } from './paperNormalization';
import {
  applyDeterministicCleanup,
  applyPaperAuditFixes,
  DeterministicFinding,
  PaperAuditModelPayload,
  runDeterministicPaperAudit,
} from './paperQualityRules';
import { regenerateSingleQuestion } from './singleQuestionRegenerator';

export interface AuditPaperOptions {
  teacherInfo?: TeacherInfo;
  mathScale?: number;
  maxPasses?: number;
  log?: LogCallback;
}

const MULTIMODAL_AUDIT_MODELS = MODEL_CHAIN.filter((m) => !isGemmaModel(m));
const AUDIT_TIMEOUT_MS = 52_000;

function formatCompactPaperForAudit(paper: GeneratedPaper): string {
  const sectionsText = (paper.sections || []).map((sec, sIdx) => {
    const bp = paper.sectionBlueprints?.[sIdx];
    const bpText = bp ? ` [Blueprint: show=${bp.questionCount}, attempt=${bp.attemptCount}, marksEach=${bp.perQuestionMarks}]` : '';
    const qLines = (sec.questions || []).map((q, qIdx) => {
      if (q.type === 'mcq') {
        const optsText = (q.options || []).map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join(' | ');
        return `  [${sIdx}:${qIdx}] MCQ (${q.marks}m) | Q: ${q.question} | Options: ${optsText} | KEY=${q.correctAnswer || 'MISSING'}`;
      }
      return `  [${sIdx}:${qIdx}] ${q.type.toUpperCase()} (${q.marks}m) | Q: ${q.question}`;
    });
    return `Section ${sIdx}: ${sec.title}${bpText}\nInstruction: ${sec.instruction || '(none)'}\n${qLines.join('\n')}`;
  });

  return [
    `Title: ${paper.title}`,
    `Subject: ${paper.subject} | Grade: ${paper.gradeLevel} | Chapter: ${paper.chapterName || 'N/A'}`,
    `Total Marks: ${paper.totalMarks} | Duration: ${paper.durationMinutes} min`,
    '',
    ...sectionsText,
  ].join('\n');
}

function buildAuditorPrompt(
  paper: GeneratedPaper,
  detFindings: DeterministicFinding[],
  build: PaperBuildInspection,
  hasVisualAttachments: boolean
): string {
  const detLines = detFindings.length > 0
    ? detFindings.slice(0, 20).map((f) => `- [${f.location}] (${f.category}): ${f.message}`).join('\n')
    : '- None';
  const buildLines = build.buildFindings.length > 0
    ? build.buildFindings.slice(0, 15).map((b) => `- ${b}`).join('\n')
    : '- None';

  const wordExcerpt = (build.docxInspection?.ooxmlDump || '').slice(0, 7500);
  const pdfExcerpt = (build.pdfLayoutDump || '').slice(0, 7500);

  return `Perform a thorough academic & visual layout audit of this exam paper and its built PDF and Word (.docx) files.

ATTACHMENTS PROVIDED:
- Visual attachments active: ${hasVisualAttachments ? 'Yes (check the attached PDF binary and rendered Word pages directly for visual layout, alignment, spacing, symbols, equation clipping, or awkward wraps).' : 'Text/XML build inspection only.'}
- Word archive stats: ${build.docxBuilt ? `${build.docxParagraphCount} paragraphs, ${build.docxMediaCount} embedded equation images, ${build.docxBytesLength} bytes` : 'Word build failed'}
- PDF build stats: ${build.pdfBuilt ? (build.pdfBase64 ? 'Full binary PDF attached' : 'PDF layout structure inspected') : 'PDF build failed'}

PRE-SCAN FINDINGS TO ADDRESS:
${detLines}

BUILD OUTPUT FINDINGS:
${buildLines}

--- STRUCTURED QUESTIONS & MCQ ANSWER KEY ---
${formatCompactPaperForAudit(paper)}

--- BUILT WORD (word/document.xml) TEXT & INDENT SUMMARY ---
${wordExcerpt || '(unavailable)'}

--- BUILT PDF LAYOUT SUMMARY ---
${pdfExcerpt || '(unavailable)'}

AUDIT CHECKLIST (check EVERY point):
1. MCQ ANSWER KEYS & ACCURACY (CRITICAL): Re-solve EVERY MCQ independently using ${paper.subject} (${paper.gradeLevel}) knowledge. If 'KEY=' points to the wrong option, is scientifically/mathematically false, or if options are ambiguous/duplicate/none-correct, put the question in 'questionFixes' with corrected 'fixedCorrectAnswer' (and/or 'fixedOptions' / 'fixedQuestion').
2. CHAPTER & MARKS SCHEME ALIGNMENT: Verify every question belongs to chapter "${paper.chapterName || paper.subject}" and fits its section's marks scheme and depth (MCQs, Short questions, Long questions). If a question is off-chapter or duplicates another item, replace it via 'questionFixes'.
3. SPELLING, GRAMMAR & FACTS: Fix typos, garbled words, truncated stems, nonsensical distractors, or factual errors in any question/option.
4. MATH & CHEMISTRY FORMATTING IN PDF & WORD: Look for raw '$', unrendered '\\frac', '\\ce', '\\alpha', lost subscripts/superscripts (e.g. 'H2O' where subscript broke or '\\left.' dot leaked), prose wrapped in '$...$', or garbled equations in the rendered PDF & Word views. Express inline math properly using '$...$' and chemistry with '$\\ce{...}$' or standard '$H_2O$' / '$SO_4^{2-}$'.
5. QUESTION/OPTION HYGIENE & VISUAL LAYOUT: Ensure NO question starts with leftover numbering ('1.', 'Q1:'), NO option has leftover 'A)'/'a)' prefix, and long options or column layouts do not collide in PDF or Word.
6. Do NOT change the number of questions or marks. Only include entries in 'questionFixes' that actually need fixing. If everything is clean and verified, set passed=true and questionFixes=[].`;
}

function normalizeModelAuditPayload(raw: string): PaperAuditModelPayload {
  const parsed = cleanAndParseJson(raw) as Partial<PaperAuditModelPayload>;
  return {
    passed: Boolean(parsed?.passed),
    summary: String(parsed?.summary || '').trim() || 'Paper checked across PDF and Word formats.',
    headerFix: parsed?.headerFix,
    questionFixes: Array.isArray(parsed?.questionFixes) ? parsed.questionFixes : [],
    layoutWarnings: Array.isArray(parsed?.layoutWarnings) ? parsed.layoutWarnings.map(String).filter(Boolean) : [],
  };
}

function buildPlainAuditSummary(
  status: PaperAuditReport['status'],
  fixesCount: number,
  checkedPdf: boolean,
  checkedDocx: boolean,
  remainingWarnings: number,
  aiCompleted: boolean
): string {
  const formats = checkedPdf && checkedDocx ? 'PDF and Word' : checkedDocx ? 'Word' : checkedPdf ? 'PDF' : 'paper';
  if (status === 'verified') {
    return aiCompleted
      ? `Verified across ${formats} builds: spelling, layout, math, and MCQ answer key are ready to print.`
      : `Checked ${formats} build formatting; automated content review could not connect offline.`;
  }
  if (status === 'fixed') {
    return `Checked ${formats} builds and automatically fixed ${fixesCount} ${fixesCount === 1 ? 'issue' : 'issues'}.`;
  }
  return `Checked ${formats} builds (${fixesCount} auto-fixed, ${remainingWarnings} ${remainingWarnings === 1 ? 'item' : 'items'} flagged for quick review).`;
}

function isAttachmentRejection(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    isPdfContextRejection(err) ||
    m.includes('mime') ||
    m.includes('inline') ||
    m.includes('payload size') ||
    m.includes('image')
  );
}

/**
 * Closed-loop PDF + Word exam paper auditor & auto-fixer.
 * Always resolves safely — never throws away an already generated paper if
 * network/API is unavailable, while still performing full local PDF+Word build checks.
 */
export async function auditAndRefinePaper(
  initialPaper: GeneratedPaper,
  options: AuditPaperOptions = {}
): Promise<GeneratedPaper> {
  const maxPasses = Math.max(1, Math.min(options.maxPasses ?? 2, 3));
  const log = (msg: string) => {
    console.log(`[paperAuditor] ${msg}`);
    options.log?.(msg);
  };

  let currentPaper: GeneratedPaper = JSON.parse(JSON.stringify(initialPaper));
  const allFixes: PaperAuditFixRecord[] = [];
  let lastWarnings: string[] = [];
  let checkedPdf = false;
  let checkedDocx = false;
  let aiCompletedAnyPass = false;
  let lastPassClean = false;
  let passesDone = 0;

  const initialCleanup = applyDeterministicCleanup(currentPaper);
  currentPaper = initialCleanup.paper;
  allFixes.push(...initialCleanup.fixes);

  for (let pass = 1; pass <= maxPasses; pass++) {
    passesDone = pass;
    log(`Checking PDF and Word builds (pass ${pass}/${maxPasses})...`);

    const detAudit = runDeterministicPaperAudit(currentPaper);
    const build = await inspectPaperBuilds(currentPaper, options.teacherInfo, options.mathScale ?? 85);
    checkedPdf = checkedPdf || build.pdfBuilt;
    checkedDocx = checkedDocx || build.docxBuilt;

    const contextParts: Part[] = [];
    if (build.pdfBase64) {
      contextParts.push({ inlineData: { mimeType: 'application/pdf', data: build.pdfBase64 } });
    }
    for (const imgBase64 of build.docxPageImagesBase64.slice(0, 2)) {
      contextParts.push({ inlineData: { mimeType: 'image/jpeg', data: imgBase64 } });
    }

    const prompt = buildAuditorPrompt(currentPaper, detAudit.findings, build, contextParts.length > 0);
    const systemInstruction =
      'You are a senior school examination quality reviewer. You inspect the actual PDF, Word (.docx) visual layout/XML, question wording, math/chemistry equations, and MCQ answer keys, returning ONLY minimal JSON diffs for actual errors.';

    const runAuditCall = (parts?: Part[]) =>
      requestJsonWithRetry<PaperAuditModelPayload>({
        operationName: `verifying PDF & Word paper (pass ${pass})`,
        systemInstruction,
        userPrompt: prompt,
        schema: paperAuditSchema,
        temperature: 0.1,
        contextParts: parts && parts.length > 0 ? parts : undefined,
        models: MULTIMODAL_AUDIT_MODELS.length > 0 ? MULTIMODAL_AUDIT_MODELS : MODEL_CHAIN,
        timeoutMs: AUDIT_TIMEOUT_MS,
        log,
        parse: normalizeModelAuditPayload,
      });

    let aiPayload: PaperAuditModelPayload | null = null;
    try {
      aiPayload = await runAuditCall(contextParts);
      aiCompletedAnyPass = true;
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      if (contextParts.length > 0 && isAttachmentRejection(errObj)) {
        log('Retrying PDF & Word verification using layout summaries...');
        try {
          aiPayload = await runAuditCall(undefined);
          aiCompletedAnyPass = true;
        } catch (fallbackErr) {
          log(`Automated visual verification skipped: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
        }
      } else {
        log(`Automated verification skipped: ${errObj.message}`);
      }
    }

    if (!aiPayload) {
      lastWarnings = Array.from(
        new Set([
          ...detAudit.findings.filter((f) => !f.autoFixable).map((f) => `${f.location}: ${f.message}`),
          ...build.buildFindings,
        ])
      );
      lastPassClean = detAudit.errorCount === 0 && build.buildFindings.length === 0;
      break;
    }

    const { paper: refinedPaper, appliedFixes } = applyPaperAuditFixes(currentPaper, aiPayload);
    currentPaper = refinedPaper;
    allFixes.push(...appliedFixes);

    const postDet = runDeterministicPaperAudit(currentPaper);
    lastWarnings = Array.from(
      new Set([
        ...(aiPayload.layoutWarnings || []),
        ...postDet.findings.filter((f) => !f.autoFixable).map((f) => `${f.location}: ${f.message}`),
        ...(appliedFixes.length === 0 ? build.buildFindings : []),
      ])
    );

    if (appliedFixes.length > 0) {
      log(`Applied ${appliedFixes.length} automatic ${appliedFixes.length === 1 ? 'correction' : 'corrections'} (pass ${pass}).`);
    }

    if (aiPayload.passed && appliedFixes.length === 0 && build.buildFindings.length === 0 && postDet.errorCount === 0) {
      lastPassClean = true;
      break;
    }

    if (pass === maxPasses && appliedFixes.length === 0 && postDet.errorCount === 0) {
      lastPassClean = true;
    }
  }

  let finalDet = runDeterministicPaperAudit(currentPaper);
  const flawedPositions = new Map<string, { sIdx: number; qIdx: number; reasons: string[]; category: DeterministicFinding['category'] }>();
  for (const f of finalDet.findings) {
    if (f.severity !== 'error' || f.sectionIndex === undefined || f.questionIndex === undefined) continue;
    const key = `${f.sectionIndex}:${f.questionIndex}`;
    const existing = flawedPositions.get(key);
    if (existing) {
      existing.reasons.push(f.message);
    } else {
      flawedPositions.set(key, {
        sIdx: f.sectionIndex,
        qIdx: f.questionIndex,
        reasons: [f.message],
        category: f.category,
      });
    }
  }

  if (flawedPositions.size > 0 && aiCompletedAnyPass) {
    let repairedCount = 0;
    for (const target of Array.from(flawedPositions.values()).slice(0, 5)) {
      const targetQ = currentPaper.sections?.[target.sIdx]?.questions?.[target.qIdx];
      if (!targetQ) continue;
      try {
        const replacement = await regenerateSingleQuestion(
          currentPaper,
          targetQ,
          `Fix quality issue(s): ${target.reasons.join('; ')}. Keep strictly aligned with chapter "${currentPaper.chapterName || currentPaper.subject}" and ensure accurate options and answer key.`
        );
        currentPaper.sections[target.sIdx].questions[target.qIdx] = replacement;
        allFixes.push({
          sectionIndex: target.sIdx,
          questionNumber: target.qIdx + 1,
          category: target.category,
          reason: `Section ${target.sIdx + 1} Q${target.qIdx + 1}: Automatically replaced flawed question.`,
          applied: true,
        });
        repairedCount += 1;
      } catch (repairErr) {
        console.warn('Silent targeted question repair skipped:', repairErr);
      }
    }
    if (repairedCount > 0) {
      const postRepairClean = applyDeterministicCleanup(currentPaper);
      currentPaper = postRepairClean.paper;
      allFixes.push(...postRepairClean.fixes);
      finalDet = runDeterministicPaperAudit(currentPaper);
    }
  }

  if (allFixes.length > 0 && lastWarnings.length === 0 && !lastPassClean) {
    const finalBuild = await inspectPaperBuilds(currentPaper, options.teacherInfo, options.mathScale ?? 85);
    checkedPdf = checkedPdf || finalBuild.pdfBuilt;
    checkedDocx = checkedDocx || finalBuild.docxBuilt;
    lastWarnings = Array.from(
      new Set([
        ...finalDet.findings.filter((f) => !f.autoFixable).map((f) => `${f.location}: ${f.message}`),
        ...finalBuild.buildFindings,
      ])
    );
  }

  const dedupedFixes = allFixes.filter(
    (fix, idx, arr) =>
      arr.findIndex(
        (other) =>
          other.sectionIndex === fix.sectionIndex &&
          other.questionNumber === fix.questionNumber &&
          other.category === fix.category &&
          other.reason === fix.reason
      ) === idx
  );

  let status: PaperAuditReport['status'];
  if (lastWarnings.length > 0 || finalDet.errorCount > 0) {
    status = 'needs_review';
  } else if (dedupedFixes.length > 0) {
    status = 'fixed';
  } else {
    status = 'verified';
  }

  const remainingCount = lastWarnings.length + finalDet.errorCount;
  const score = Math.max(0, Math.min(100, 100 - remainingCount * 10 - (aiCompletedAnyPass ? 0 : 15)));

  const report: PaperAuditReport = {
    status,
    score,
    passesCompleted: passesDone,
    issuesFixedCount: dedupedFixes.length,
    remainingIssuesCount: remainingCount,
    checkedPdf,
    checkedDocx,
    summary: buildPlainAuditSummary(
      status,
      dedupedFixes.length,
      checkedPdf,
      checkedDocx,
      remainingCount,
      aiCompletedAnyPass
    ),
    fixes: dedupedFixes,
    warnings: lastWarnings,
    checkedAt: Date.now(),
  };

  return {
    ...currentPaper,
    auditReport: report,
  };
}

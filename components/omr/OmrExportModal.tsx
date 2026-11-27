import React, { useEffect, useMemo, useState } from 'react';
import { Download, KeyRound, QrCode } from 'lucide-react';
import { GeneratedPaper } from '../../types';
import { BaseModal } from '../ui/BaseModal';
import Spinner from '../ui/Spinner';
import { normalizeGradeLevel } from '../../services/marksheet/calculations';
import { fetchSheetData } from '../../services/sheets/fetcher';
import { clampClassroomMcqCount } from '../../services/omr/classroomRanking';
import {
  extractPaperOmrData,
  generateOmrPdf,
  triggerOmrPdfDownload,
} from '../../services/omr/omrPdfGenerator';
import {
  generateTestCode,
  listOmrTests,
  OmrTestRecord,
  saveOmrTestRecord,
  todayIsoDate,
} from '../../services/omr/testRegistry';
import {
  generateAnswerKeyPdf,
  triggerAnswerKeyPdfDownload,
} from '../../services/omr/answerKeyPdf';
import {
  ClassroomTestFrequency,
  OmrStudentPrintTarget,
  normalizeAnswerKeyString,
} from '../../services/omr/types';
import { OmrExportFormFields } from './OmrExportFormFields';
import { toUserErrorMessage } from '../../utils/userMessage';

export interface OmrExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper?: GeneratedPaper;
  initialTestCode?: string;
  defaultClassLevel?: string;
  defaultSubject?: string;
  defaultTitle?: string;
  defaultMcqCount?: number;
  schoolName?: string;
  onSavedTest?: (record: OmrTestRecord) => void;
}

export const OmrExportModal: React.FC<OmrExportModalProps> = ({
  isOpen,
  onClose,
  paper,
  initialTestCode,
  defaultClassLevel = 'IX',
  defaultSubject = 'Physics',
  defaultTitle = 'Weekly Classroom Test',
  defaultMcqCount = 30,
  schoolName = 'Peoples Higher Secondary School Jamshoro',
  onSavedTest,
}) => {
  const extracted = useMemo(() => (paper ? extractPaperOmrData(paper) : null), [paper]);

  const [savedTests, setSavedTests] = useState<OmrTestRecord[]>([]);
  const [selectedSavedCode, setSelectedSavedCode] = useState<string>('');
  const [mode, setMode] = useState<'batch' | 'blank'>('batch');
  const [testFrequency, setTestFrequency] = useState<ClassroomTestFrequency>('weekly');
  const [classLevel, setClassLevel] = useState<string>('IX');
  const [subject, setSubject] = useState<string>('Physics');
  const [title, setTitle] = useState<string>('Weekly Classroom Test');
  const [testNumber, setTestNumber] = useState<string>('Test #01');
  const [testDate, setTestDate] = useState<string>(todayIsoDate());
  const [testCode, setTestCode] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(30);
  const [answerKey, setAnswerKey] = useState<string>('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

  const [roster, setRoster] = useState<OmrStudentPrintTarget[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const clampOmrCount = (raw: number) => Math.max(1, Math.min(100, Math.round(Number(raw) || 30)));

  const applySavedTest = (record: OmrTestRecord) => {
    const cls = normalizeGradeLevel(record.classLevel) || record.classLevel || 'IX';
    const cnt = clampOmrCount(record.questionCount);
    setSelectedSavedCode(record.testCode);
    setClassLevel(cls);
    setSubject(record.subject);
    setTitle(record.title);
    setTestFrequency(record.testFrequency === 'monthly' ? 'monthly' : 'weekly');
    setTestNumber(record.testNumber || 'Test #01');
    setTestDate(record.testDate || todayIsoDate());
    setTestCode(record.testCode);
    setQuestionCount(cnt);
    setAnswerKey(normalizeAnswerKeyString(record.answerKey, cnt));
  };

  useEffect(() => {
    if (!isOpen) return;
    const allSaved = listOmrTests();
    setSavedTests(allSaved);

    if (extracted) {
      const cls = normalizeGradeLevel(extracted.classLevel) || extracted.classLevel || 'IX';
      const cnt = clampOmrCount(extracted.questionCount);
      setSelectedSavedCode(extracted.paperId || '');
      setClassLevel(cls);
      setSubject(extracted.subject);
      setTitle(extracted.title);
      setTestFrequency(extracted.testFrequency);
      setTestNumber(extracted.testNumber || 'Test #01');
      setTestDate(extracted.testDate || todayIsoDate());
      setTestCode(extracted.paperId || generateTestCode(extracted.subject, cls, extracted.testNumber));
      setQuestionCount(cnt);
      setAnswerKey(normalizeAnswerKeyString(extracted.answerKey, cnt));
    } else {
      const targetSaved =
        (initialTestCode && allSaved.find((t) => t.testCode === initialTestCode)) ||
        allSaved[0];
      if (targetSaved) {
        applySavedTest(targetSaved);
      } else {
        const normalized = normalizeGradeLevel(defaultClassLevel) || defaultClassLevel || 'IX';
        const sub = defaultSubject || 'Physics';
        const cnt = clampClassroomMcqCount(defaultMcqCount || 30);
        setSelectedSavedCode('');
        setClassLevel(normalized);
        setSubject(sub);
        setTitle(defaultTitle || `${sub} Classroom Test`);
        setTestFrequency('weekly');
        setTestNumber('Test #01');
        setTestDate(todayIsoDate());
        setTestCode(generateTestCode(sub, normalized, 'T01'));
        setQuestionCount(cnt);
        setAnswerKey(normalizeAnswerKeyString('', cnt));
      }
    }
    setExportStatus(null);
  }, [isOpen, extracted, initialTestCode, defaultClassLevel, defaultSubject, defaultTitle, defaultMcqCount]);

  useEffect(() => {
    if (!isOpen || mode !== 'batch') return;
    let cancelled = false;
    setLoadingRoster(true);
    setRosterError(null);
    fetchSheetData()
      .then((res) => {
        if (cancelled) return;
        const targetGrade = normalizeGradeLevel(classLevel);
        const filtered = (res.records || [])
          .filter((r) => {
            const st = (r.status || '').toLowerCase();
            if (st.includes('drop') || st.includes('left')) return false;
            if (!targetGrade) return true;
            return normalizeGradeLevel(r.currentClass) === targetGrade;
          })
          .map((r) => ({
            grNo: String(r.grNo || '').trim(),
            studentName: String(r.studentName || '').trim() || `Student ${r.grNo}`,
            fatherName: String(r.fatherName || '').trim(),
            currentClass: String(r.currentClass || classLevel).trim(),
            section: String(r.section || '').trim(),
          }))
          .filter((s) => s.grNo.length > 0)
          .sort((a, b) => Number(a.grNo) - Number(b.grNo) || a.grNo.localeCompare(b.grNo));
        setRoster(filtered);
      })
      .catch((err) => {
        if (!cancelled) {
          setRoster([]);
          setRosterError(toUserErrorMessage(err, 'Unable to load class roster.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, classLevel]);

  const normalizedKey = useMemo(
    () => normalizeAnswerKeyString(answerKey, questionCount),
    [answerKey, questionCount]
  );

  const effectiveCode = useMemo(
    () => testCode.trim() || generateTestCode(subject, classLevel, testNumber),
    [testCode, subject, classLevel, testNumber]
  );

  const persistRegistry = () => {
    const saved = saveOmrTestRecord({
      testCode: effectiveCode,
      savedPaperId: paper?.savedPaperId,
      title,
      subject,
      classLevel: normalizeGradeLevel(classLevel) || classLevel,
      testFrequency,
      testNumber: testNumber.trim() || 'Test #01',
      testDate: testDate || todayIsoDate(),
      questionCount,
      answerKey: normalizedKey,
      paperSnapshot: paper,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setSavedTests(listOmrTests());
    onSavedTest?.(saved);
  };

  const handleSelectSavedTest = (code: string) => {
    setSelectedSavedCode(code);
    if (!code) return;
    const found = savedTests.find((t) => t.testCode === code);
    if (found) applySavedTest(found);
  };

  const handleGeneratePdf = async () => {
    setIsExporting(true);
    setExportStatus(null);
    try {
      persistRegistry();
      const effectiveMode = mode === 'batch' && roster.length > 0 ? 'batch' : 'blank';
      const bytes = await generateOmrPdf({
        paperId: effectiveCode,
        title,
        subject,
        classLevel,
        questionCount,
        answerKey: normalizedKey,
        testFrequency,
        testNumber: testNumber.trim() || 'Test #01',
        testDate: testDate || todayIsoDate(),
        schoolName,
        mode: effectiveMode,
        students: effectiveMode === 'batch' ? roster : undefined,
      });

      const safeSub = subject.replace(/[^a-zA-Z0-9]+/g, '_');
      const safeCls = classLevel.replace(/[^a-zA-Z0-9]+/g, '_');
      const suffix = effectiveMode === 'batch' ? `Batch_${roster.length}Students` : 'Blank_Template';
      triggerOmrPdfDownload(bytes, `OMR_${safeCls}_${safeSub}_${effectiveCode}_${suffix}.pdf`);
      setExportStatus(
        effectiveMode === 'batch'
          ? `Downloaded ${roster.length}-page A4 OMR packet (Code: ${effectiveCode}).`
          : `Downloaded blank A4 OMR template with 4-digit GR grid (Code: ${effectiveCode}).`
      );
    } catch (err) {
      setExportStatus(toUserErrorMessage(err, 'Failed to generate OMR PDF.'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadKeyPdf = async () => {
    try {
      persistRegistry();
      const keyBytes = await generateAnswerKeyPdf({
        schoolName,
        subject,
        classLevel,
        title,
        testCode: effectiveCode,
        testNumber: testNumber.trim() || 'Test #01',
        testDate: testDate || todayIsoDate(),
        questionCount,
        answerKey: normalizedKey,
      });
      triggerAnswerKeyPdfDownload(keyBytes, effectiveCode);
      setExportStatus(`Downloaded Answer Key PDF for ${effectiveCode}.`);
    } catch (err) {
      setExportStatus(toUserErrorMessage(err, 'Failed to generate Answer Key PDF.'));
    }
  };

  const pageCountLabel =
    mode === 'batch'
      ? loadingRoster
        ? 'Loading roster...'
        : `${roster.length} personalized pages`
      : '1 master template page (4-digit GR grid)';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title="Generate OMR Answer Sheets"
      icon={
        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
          <QrCode className="w-5 h-5" />
        </div>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-brand-border text-brand-text-secondary hover:bg-brand-bg transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownloadKeyPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Download Key PDF
          </button>
          <button
            type="button"
            id="omr-modal-generate-pdf-btn"
            disabled={isExporting || (mode === 'batch' && loadingRoster)}
            onClick={handleGeneratePdf}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isExporting ? <Spinner className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {isExporting
              ? 'Generating A4 PDF...'
              : mode === 'batch' && roster.length > 0
                ? `Download ${roster.length}-Page OMR PDF`
                : 'Download Blank OMR PDF'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <OmrExportFormFields
          mode={mode}
          onModeChange={setMode}
          savedTests={savedTests}
          selectedSavedCode={selectedSavedCode}
          onSelectSavedTest={handleSelectSavedTest}
          hasLockedPaper={Boolean(extracted)}
          classLevel={classLevel}
          onClassLevelChange={setClassLevel}
          testFrequency={testFrequency}
          onTestFrequencyChange={setTestFrequency}
          questionCount={questionCount}
          onQuestionCountChange={setQuestionCount}
          testNumber={testNumber}
          onTestNumberChange={setTestNumber}
          testDate={testDate}
          onTestDateChange={setTestDate}
          testCode={testCode}
          onTestCodeChange={setTestCode}
          subject={subject}
          onSubjectChange={setSubject}
          title={title}
          onTitleChange={setTitle}
          answerKey={answerKey}
          onAnswerKeyChange={setAnswerKey}
          normalizedKey={normalizedKey}
        />

        {/* Batch Summary Strip */}
        <div className="rounded-xl border border-brand-border bg-slate-50/80 dark:bg-slate-800/40 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-brand-text-secondary">
            Output: <strong className="text-brand-text-primary tabular-nums">{pageCountLabel}</strong>
            {' · '}
            Class <strong className="text-brand-text-primary">{classLevel}</strong> ·{' '}
            <strong className="text-brand-text-primary tabular-nums">{questionCount} MCQs</strong>
          </div>
          {mode === 'batch' && rosterError && (
            <span className="text-amber-600 dark:text-amber-400">
              Roster unavailable ({rosterError}); Blank template will be exported.
            </span>
          )}
          {mode === 'batch' && !loadingRoster && !rosterError && roster.length === 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              No enrolled students found for Class {classLevel}; falls back to Blank template.
            </span>
          )}
        </div>

        {exportStatus && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {exportStatus}
          </div>
        )}
      </div>
    </BaseModal>
  );
};

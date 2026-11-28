import React, { useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  KeyRound,
  QrCode,
  ScanLine,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatTestFrequencyLabel } from '../../services/omr/classroomRanking';
import {
  generateAnswerKeyPdf,
  triggerAnswerKeyPdfDownload,
} from '../../services/omr/answerKeyPdf';
import { todayIsoDate } from '../../services/omr/testRegistry';
import { useToast } from '../../hooks/useToast';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import SelectField from '../ui/SelectField';
import { SegmentedControl } from '../ui/SegmentedControl';
import { OmrExportModal } from './OmrExportModal';
import { OmrOverridePanel } from './OmrOverridePanel';
import { OmrResultListPanel } from './OmrResultListPanel';
import { OmrScannerCanvas } from './OmrScannerCanvas';
import { useOmrScanner } from './useOmrScanner';
import { getCachedSchoolConfig } from '../../services/schoolConfigService';

export interface OmrScannerViewProps {
  initialFilter?: {
    testCode?: string;
  } | null;
  schoolName?: string;
  onBackToPaper?: () => void;
}

export const OmrScannerView: React.FC<OmrScannerViewProps> = ({
  initialFilter,
  schoolName,
  onBackToPaper,
}) => {
  const resolvedSchoolName = schoolName || getCachedSchoolConfig().schoolName;
  const { showToast, ToastComponent } = useToast(4500);
  const scanner = useOmrScanner({ initialFilter, showToast });
  const [showOmrSheetModal, setShowOmrSheetModal] = useState(false);

  const handleDownloadActiveKeyPdf = async () => {
    const reg = scanner.activeRegistryTest;
    const qr = scanner.scanResult?.qrPayload;
    const testCode = reg?.testCode || qr?.pid || scanner.activeTestCode;
    const keyStr = reg?.answerKey || qr?.key || '';
    const count = reg?.questionCount || qr?.n || 30;
    const bytes = await generateAnswerKeyPdf({
      schoolName: resolvedSchoolName,
      subject: reg?.subject || qr?.sub || scanner.resultSummary.subject,
      classLevel: reg?.classLevel || qr?.cls || scanner.resultSummary.classLevel,
      title: reg?.title || qr?.ttl || scanner.resultSummary.title,
      testCode,
      testNumber: reg?.testNumber || scanner.resultSummary.testNumber || 'Test #01',
      testDate: reg?.testDate || scanner.resultSummary.testDate || todayIsoDate(),
      questionCount: count,
      answerKey: keyStr,
    });
    triggerAnswerKeyPdfDownload(bytes, testCode);
    showToast(`Downloaded Answer Key PDF (${testCode}).`, 'success');
  };

  return (
    <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-5">
      {ToastComponent}

      <input
        ref={scanner.fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            scanner.handleFilesUpload(e.target.files);
          }
          e.target.value = '';
        }}
      />

      <OmrExportModal
        isOpen={showOmrSheetModal}
        onClose={() => setShowOmrSheetModal(false)}
        initialTestCode={scanner.activeRegistryTest?.testCode}
        defaultClassLevel={scanner.resultSummary.classLevel}
        defaultSubject={scanner.resultSummary.subject}
        defaultTitle={scanner.resultSummary.title}
        defaultMcqCount={scanner.resultSummary.totalMarks}
        schoolName={resolvedSchoolName}
        onSavedTest={(saved) => {
          scanner.refreshRegisteredTests();
          scanner.setActiveTestCode(saved.testCode);
        }}
      />

      {/* Scanner Header Bar */}
      <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5 flex flex-col gap-3 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {onBackToPaper && (
              <button
                type="button"
                onClick={onBackToPaper}
                className="p-2 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-secondary cursor-pointer"
                title="Back to Paper Maker"
                aria-label="Back to Paper Maker"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-brand-text-primary tracking-tight">
                OMR Scanner
              </h1>
              <p className="text-xs text-brand-text-secondary mt-0.5 tabular-nums">
                {formatTestFrequencyLabel(scanner.resultSummary.testFrequency)} · Class{' '}
                {scanner.resultSummary.classLevel} · {scanner.resultSummary.subject} ·{' '}
                <strong>{scanner.resultSummary.testNumber}</strong> ({scanner.resultSummary.testDate}) ·{' '}
                Scanned:{' '}
                <strong className="text-brand-text-primary">
                  {scanner.resultSummary.scannedCount}
                  {scanner.classEnrolledCount > 0 ? ` / ${scanner.classEnrolledCount}` : ''}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="omr-open-sheet-generator-btn"
              onClick={() => setShowOmrSheetModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-blue-600/30 bg-blue-50/70 dark:bg-blue-950/35 text-blue-700 dark:text-blue-300 hover:bg-blue-100/70 dark:hover:bg-blue-950/50 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Print OMR Sheets</span>
            </button>

            <div className="w-[186px]">
              <SegmentedControl
                size="sm"
                value={scanner.scanMode}
                onChange={scanner.setScanMode}
                options={[
                  { value: 'batch', label: 'Batch Auto' },
                  { value: 'single', label: 'Single Shot' },
                ]}
              />
            </div>

            <button
              type="button"
              onClick={() => scanner.setSoundMuted((m) => !m)}
              title={scanner.soundMuted ? 'Unmute scan chimes' : 'Mute scan chimes'}
              aria-label={scanner.soundMuted ? 'Unmute scan chimes' : 'Mute scan chimes'}
              className="p-2 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-secondary hover:text-brand-text-primary cursor-pointer transition-colors"
            >
              {scanner.soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            </button>

            {!scanner.isCameraActive ? (
              <button
                type="button"
                onClick={scanner.handleStartCamera}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{scanner.scanMode === 'batch' ? 'Start Batch Camera' : 'Start Camera'}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={scanner.handleCaptureCameraFrame}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>Capture Now</span>
                </button>
                <button
                  type="button"
                  onClick={scanner.stopCamera}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-brand-border bg-brand-bg text-brand-text-primary flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CameraOff className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => scanner.fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-brand-text-primary flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Sheet Photo(s)</span>
            </button>

            <button
              type="button"
              id="omr-load-sample-btn"
              onClick={scanner.handleLoadSampleSheet}
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Sample Sheet</span>
            </button>
          </div>
        </div>

        {/* Registered Test Selector & Key Download Strip */}
        {scanner.availableTestCodes.length > 0 && (
          <div className="pt-3 border-t border-brand-border/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-semibold text-brand-text-secondary">Active Test:</span>
              <SelectField
                id="omr-active-test-select"
                aria-label="Select Registered OMR Test"
                size="sm"
                inline
                searchable
                dropdownWidth="wide"
                value={scanner.activeTestCode}
                onChange={(e) => scanner.setActiveTestCode(e.target.value)}
                options={scanner.availableTestCodes.map((t) => ({
                  value: t.testCode,
                  label: t.label,
                  badge: `${t.count}`,
                }))}
                className="max-w-xs sm:max-w-md"
              />
            </div>

            <button
              type="button"
              onClick={handleDownloadActiveKeyPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-brand-text-primary cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Download Test Key (PDF)</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5 items-start print:hidden">
        <OmrScannerCanvas
          videoRef={scanner.videoRef}
          isCameraActive={scanner.isCameraActive}
          scanMode={scanner.scanMode}
          batchTelemetry={scanner.batchTelemetry}
          capturedImage={scanner.capturedImage}
          scanResult={scanner.scanResult}
          effectiveAnswers={scanner.effectiveAnswers}
          cameraError={scanner.cameraError}
          onStartCamera={scanner.handleStartCamera}
          onUploadClick={() => scanner.fileInputRef.current?.click()}
          onLoadSample={scanner.handleLoadSampleSheet}
        />

        <OmrOverridePanel
          scanResult={scanner.scanResult}
          effectiveAnswers={scanner.effectiveAnswers}
          computedStats={scanner.computedStats}
          grNumber={scanner.grNumber}
          onGrNumberChange={scanner.setGrNumber}
          matchedStudentName={scanner.matchedRosterStudent?.studentName || null}
          matchedFatherName={scanner.matchedRosterStudent?.fatherName || null}
          onOverrideQuestion={scanner.handleOverrideQuestion}
          onSaveUpdatedRow={scanner.handleSaveUpdatedStudentRow}
          targetExamType={scanner.targetExamType}
          onTargetExamTypeChange={scanner.setTargetExamType}
          onPushToMarksheet={() => scanner.handlePushActiveToMarksheet(false)}
          lastSavedSummary={scanner.lastSavedSummary}
          identifiedFrequency={scanner.resultSummary.testFrequency}
          identifiedTestNumber={
            scanner.activeRegistryTest?.testNumber || scanner.resultSummary.testNumber
          }
          identifiedTestDate={
            scanner.activeRegistryTest?.testDate || scanner.resultSummary.testDate
          }
          onDownloadKeyPdf={handleDownloadActiveKeyPdf}
        />
      </div>

      {/* Notice Board Class Test Result Announcement */}
      <OmrResultListPanel
        summary={scanner.resultSummary}
        rosterRecords={scanner.roster}
        schoolName={resolvedSchoolName}
        availableTestCodes={scanner.availableTestCodes}
        targetExamType={scanner.targetExamType}
        onPushAllToMarksheet={() => scanner.handlePushBatchToMarksheet(false)}
        onSelectTestCode={scanner.setActiveTestCode}
        onRemoveRow={scanner.handleRemoveResultRow}
        onClearTestResults={scanner.handleClearTestResults}
      />

      {scanner.marksheetConflict && (
        <ConfirmDialog
          isOpen
          variant="warning"
          title="Overwrite Existing Marksheet Score?"
          message={`GR #${scanner.marksheetConflict.resolvedGrNo} (${scanner.marksheetConflict.studentName}) already has ${scanner.marksheetConflict.existingScore} recorded for ${scanner.marksheetConflict.subjectKey} (${scanner.marksheetConflict.examType}). Replace it with OMR score ${scanner.marksheetConflict.proposedScore}?`}
          confirmLabel="Overwrite Score"
          onConfirm={scanner.confirmMarksheetOverwrite}
          onCancel={scanner.dismissMarksheetConflict}
        />
      )}
    </div>
  );
};

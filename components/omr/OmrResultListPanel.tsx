import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Printer,
  Trash2,
} from 'lucide-react';
import { normalizeGrKey } from '../../services/identityNormalization';
import { normalizeGradeLevel } from '../../services/marksheet/calculations';
import type { MarksheetExamType } from '../../services/marksheet/types';
import type { StudentRecord } from '../../services/sheets/types';
import {
  computeCompetitionRanks,
  formatTestFrequencyLabel,
} from '../../services/omr/classroomRanking';
import {
  formatResultListCsv,
  generateTestResultListPdf,
  triggerResultListPdfDownload,
} from '../../services/omr/resultListPdf';
import {
  PrintableClassResultSummary,
  ScannedStudentResultRow,
} from '../../services/omr/scanResultsStore';
import SelectField from '../ui/SelectField';
import { getCachedSchoolConfig } from '../../services/schoolConfigService';

export interface OmrResultListPanelProps {
  summary: PrintableClassResultSummary;
  rosterRecords: StudentRecord[];
  schoolName?: string;
  availableTestCodes: Array<{
    testCode: string;
    label: string;
    count: number;
  }>;
  targetExamType?: MarksheetExamType;
  onPushAllToMarksheet?: () => void;
  onSelectTestCode: (code: string) => void;
  onRemoveRow: (grNo: string) => void;
  onClearTestResults: () => void;
}

export const OmrResultListPanel: React.FC<OmrResultListPanelProps> = ({
  summary,
  rosterRecords,
  schoolName,
  availableTestCodes,
  targetExamType = 'midterm',
  onPushAllToMarksheet,
  onSelectTestCode,
  onRemoveRow,
  onClearTestResults,
}) => {
  const resolvedSchoolName = schoolName || getCachedSchoolConfig().schoolName;
  const [viewMode, setViewMode] = useState<'ranked' | 'roster'>('ranked');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const rankedRows = useMemo(() => computeCompetitionRanks(summary.rows), [summary.rows]);

  const rosterWithScanStatus = useMemo(() => {
    const scannedByGr = new Map<string, ScannedStudentResultRow & { rank: number }>();
    rankedRows.forEach((r) => scannedByGr.set(normalizeGrKey(r.grNo), r));

    const classRoster = rosterRecords
      .filter(
        (r) =>
          normalizeGradeLevel(r.currentClass) === summary.classLevel &&
          !(r.status || '').toLowerCase().includes('drop') &&
          !(r.status || '').toLowerCase().includes('left')
      )
      .sort((a, b) => Number(a.grNo) - Number(b.grNo) || a.grNo.localeCompare(b.grNo));

    const merged = classRoster.map((student) => {
      const scan = scannedByGr.get(normalizeGrKey(student.grNo));
      return {
        grNo: student.grNo,
        studentName: student.studentName,
        fatherName: student.fatherName || '—',
        scan: scan || null,
      };
    });

    const rosterKeys = new Set(classRoster.map((s) => normalizeGrKey(s.grNo)));
    rankedRows.forEach((r) => {
      if (!rosterKeys.has(normalizeGrKey(r.grNo))) {
        merged.push({
          grNo: r.grNo,
          studentName: r.studentName,
          fatherName: r.fatherName || '—',
          scan: r,
        });
      }
    });

    return merged;
  }, [rosterRecords, summary.classLevel, rankedRows]);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const bytes = await generateTestResultListPdf(summary, resolvedSchoolName);
      triggerResultListPdfDownload(bytes, summary.testCode);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadCsv = () => {
    const csv = formatResultListCsv(summary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NoticeBoard_Result_${summary.testCode}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="omr-result-list-panel"
      className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5 space-y-4 print:border-0 print:shadow-none"
    >
      {/* Print-Only Formal School Header */}
      <div className="hidden print:block text-center pb-2 border-b border-slate-300">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-900">{resolvedSchoolName}</p>
        <p className="text-base font-bold text-slate-900">CLASS TEST RESULT ANNOUNCEMENT</p>
      </div>

      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-brand-border/80">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Award className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-brand-text-primary">
              Class Test Result Announcement (Notice Board)
            </h2>
            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {summary.testCode}
            </span>
          </div>
          <p className="text-xs text-brand-text-secondary mt-1">
            {formatTestFrequencyLabel(summary.testFrequency)} ·{' '}
            <strong>{summary.subject}</strong> · Class <strong>{summary.classLevel}</strong> ·{' '}
            <strong>{summary.testNumber}</strong> · Date: <strong>{summary.testDate}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {availableTestCodes.length > 0 && (
            <SelectField
              id="omr-result-test-select"
              aria-label="Select Scanned Test Result List"
              size="sm"
              inline
              searchable
              dropdownWidth="wide"
              value={summary.testCode}
              onChange={(e) => onSelectTestCode(e.target.value)}
              options={availableTestCodes.map((t) => ({
                value: t.testCode,
                label: t.label,
                badge: `${t.count}`,
              }))}
              className="max-w-[260px]"
            />
          )}

          {onPushAllToMarksheet && (
            <button
              type="button"
              id="omr-push-batch-marksheet-btn"
              disabled={rankedRows.length === 0}
              onClick={onPushAllToMarksheet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-45 cursor-pointer transition-colors"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Save All ({targetExamType})</span>
            </button>
          )}

          <button
            type="button"
            id="omr-download-result-pdf-btn"
            disabled={isGeneratingPdf || rankedRows.length === 0}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isGeneratingPdf ? 'Preparing PDF...' : 'Notice Board PDF'}</span>
          </button>

          <button
            type="button"
            id="omr-print-result-btn"
            disabled={rankedRows.length === 0}
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-brand-text-primary disabled:opacity-45 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Notice</span>
          </button>

          <button
            type="button"
            disabled={rankedRows.length === 0}
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-brand-border bg-brand-bg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-brand-text-primary disabled:opacity-45 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Strip + View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs flex-1">
          <div className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2">
            <div className="text-[10px] uppercase text-brand-text-tertiary font-semibold">Scanned</div>
            <div className="font-bold text-brand-text-primary tabular-nums">
              {summary.scannedCount}
              {summary.enrolledCount > 0 ? ` / ${summary.enrolledCount}` : ''}
            </div>
          </div>
          <div className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2">
            <div className="text-[10px] uppercase text-brand-text-tertiary font-semibold">Average</div>
            <div className="font-bold text-brand-text-primary tabular-nums">
              {summary.averageScore} / {summary.totalMarks} ({summary.averagePercentage}%)
            </div>
          </div>
          <div className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2">
            <div className="text-[10px] uppercase text-brand-text-tertiary font-semibold">Highest</div>
            <div className="font-bold text-brand-text-primary tabular-nums">
              {summary.highestScore} / {summary.totalMarks}
            </div>
          </div>
          <div className="rounded-xl border border-brand-border bg-brand-bg px-3 py-2">
            <div className="text-[10px] uppercase text-brand-text-tertiary font-semibold">Pass Rate</div>
            <div className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {summary.passRate}%
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setViewMode('ranked')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
              viewMode === 'ranked'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-brand-bg border border-brand-border text-brand-text-secondary'
            }`}
          >
            Ranked Notice Board ({rankedRows.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('roster')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
              viewMode === 'roster'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                : 'bg-brand-bg border border-brand-border text-brand-text-secondary'
            }`}
          >
            Full Class Roster ({rosterWithScanStatus.length})
          </button>
          {rankedRows.length > 0 && (
            <button
              type="button"
              onClick={onClearTestResults}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              title="Clear scanned results for this test"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Notice Board Result Table */}
      <div className="overflow-x-auto rounded-xl border border-brand-border">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/90 dark:bg-slate-800/80 text-brand-text-secondary border-b border-brand-border">
              <th className="py-2.5 px-3 font-semibold">Rank</th>
              <th className="py-2.5 px-3 font-semibold">GR No</th>
              <th className="py-2.5 px-3 font-semibold">Student Name</th>
              <th className="py-2.5 px-3 font-semibold">Father&apos;s Name</th>
              <th className="py-2.5 px-3 font-semibold text-right">Marks</th>
              <th className="py-2.5 px-3 font-semibold text-right">Percentage</th>
              <th className="py-2.5 px-2 print:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/70">
            {viewMode === 'ranked' && rankedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-brand-text-secondary">
                  No OMR sheets scanned for <strong>{summary.testCode}</strong> yet. Scan or
                  upload sheets above to publish ranked results here automatically.
                </td>
              </tr>
            )}

            {viewMode === 'ranked' &&
              rankedRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td
                    className={`py-2 px-3 font-mono font-bold tabular-nums ${
                      row.rank <= 3
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-brand-text-secondary'
                    }`}
                  >
                    #{row.rank}
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-brand-text-primary tabular-nums">
                    {row.grNo}
                  </td>
                  <td className="py-2 px-3 font-semibold text-brand-text-primary">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{row.studentName}</span>
                      {row.syncedToMarksheet && (
                        <span title="Saved to Marksheet" className="inline-flex items-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-brand-text-secondary">
                    {row.fatherName || '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-brand-text-primary">
                    {row.score} / {row.total}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-brand-text-secondary">
                    {row.percentage.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right print:hidden">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.grNo)}
                      aria-label={`Remove ${row.studentName}`}
                      className="p-1 text-brand-text-tertiary hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

            {viewMode === 'roster' &&
              rosterWithScanStatus.map((item, idx) => (
                <tr
                  key={`${item.grNo}-${idx}`}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2 px-3 font-mono tabular-nums text-brand-text-tertiary">
                    {item.scan ? `#${item.scan.rank}` : '—'}
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-brand-text-primary tabular-nums">
                    {item.grNo}
                  </td>
                  <td className="py-2 px-3 font-semibold text-brand-text-primary">
                    {item.studentName}
                  </td>
                  <td className="py-2 px-3 text-brand-text-secondary">{item.fatherName}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-brand-text-primary">
                    {item.scan ? `${item.scan.score} / ${item.scan.total}` : 'Pending'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-brand-text-secondary">
                    {item.scan ? `${item.scan.percentage.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2 px-2 print:hidden" />
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

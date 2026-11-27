import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import {
  MarksheetLogoAssets,
} from '../../services/marksheet/pdfGenerator';
import {
  GradingSystemType,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  ComputedStudentMarksheet,
  StudentMarkEntry,
} from '../../services/marksheet/types';
import {
  applyImportedEntries,
  exportBatchMarksheetsPdfAction,
  exportSingleMarksheetPdfAction,
  importWorkbookFileAction,
  mergeConfigPatch,
} from './marksheetExportActions';
import { toUserErrorMessage } from '../../utils/userMessage';

export function useMarksheetExports(params: {
  isAdmin: boolean;
  examType: MarksheetExamType;
  gradingSystem: GradingSystemType;
  gradeFilter: 'ALL' | MarksheetGradeLevel;
  config: MarksheetConfig;
  setConfig: Dispatch<SetStateAction<MarksheetConfig>>;
  setEntriesMap: Dispatch<SetStateAction<Record<string, StudentMarkEntry>>>;
  setSelectedGrNo: Dispatch<SetStateAction<string>>;
  setGrInput: Dispatch<SetStateAction<string>>;
  roster: MarksheetRosterStudent[];
  examEntriesByGr: Record<string, StudentMarkEntry>;
  activeMarksheet: ComputedStudentMarksheet | null;
  logos: MarksheetLogoAssets;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const {
    isAdmin,
    examType,
    gradingSystem,
    gradeFilter,
    config,
    setConfig,
    setEntriesMap,
    setSelectedGrNo,
    setGrInput,
    roster,
    examEntriesByGr,
    activeMarksheet,
    logos,
    showToast,
  } = params;

  const [isExportingSingle, setIsExportingSingle] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const handleImportFile = useCallback(
    async (file: File) => {
      if (!isAdmin) return;
      try {
        await importWorkbookFileAction({
          file,
          examType,
          academicYear: config.academicYear,
          onConfig: (patch) => setConfig((prev) => mergeConfigPatch(prev, patch)),
          onEntries: (entries) => {
            setEntriesMap((prev) => applyImportedEntries(prev, entries, examType));
            if (entries.length > 0) {
              setSelectedGrNo(entries[0].grNo);
              setGrInput(entries[0].grNo);
            }
          },
          showToast,
        });
      } catch (err: unknown) {
        showToast(toUserErrorMessage(err, 'Could not read uploaded spreadsheet.'), 'error');
      }
    },
    [isAdmin, examType, config.academicYear, setConfig, setEntriesMap, setSelectedGrNo, setGrInput, showToast]
  );

  const handleDownloadSinglePdf = useCallback(async () => {
    if (!activeMarksheet) return;
    setIsExportingSingle(true);
    try {
      const filename = await exportSingleMarksheetPdfAction({
        marksheet: activeMarksheet,
        config,
        logos,
      });
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err: unknown) {
      showToast(toUserErrorMessage(err, 'Failed to generate PDF.'), 'error');
    } finally {
      setIsExportingSingle(false);
    }
  }, [activeMarksheet, config, logos, showToast]);

  const handleDownloadAllPdf = useCallback(async () => {
    if (!roster.length) {
      showToast('No students in the active list to export.', 'error');
      return;
    }
    setBatchProgress({ done: 0, total: roster.length });
    try {
      const { filename, count } = await exportBatchMarksheetsPdfAction({
        roster,
        examEntriesByGr,
        config,
        examType,
        gradingSystem,
        gradeFilter,
        logos,
        onProgress: (done, total) => setBatchProgress({ done, total }),
      });
      showToast(`Exported ${count} A4 marksheets into ${filename}.`, 'success');
    } catch (err: unknown) {
      showToast(toUserErrorMessage(err, 'Failed to generate PDF.'), 'error');
    } finally {
      setBatchProgress(null);
    }
  }, [roster, examEntriesByGr, config, examType, gradingSystem, gradeFilter, logos, showToast]);

  return {
    handleImportFile,
    handleDownloadSinglePdf,
    handleDownloadAllPdf,
    isExportingSingle,
    batchProgress,
  };
}

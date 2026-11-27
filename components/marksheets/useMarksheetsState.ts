import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSheetData } from '../../services/googleSheetsService';
import type { StudentRecord } from '../../services/sheets/types';
import { normalizeGrKey } from '../../services/identityNormalization';
import {
  buildMarksheetRoster,
  computeStudentMarksheet,
  getSubjectsForGrade,
} from '../../services/marksheet/calculations';
import {
  fetchMarksheetLogoAssets,
  MarksheetLogoAssets,
} from '../../services/marksheet/pdfGenerator';
import {
  loadMarksheetConfig,
  loadMarksheetEntries,
  makeMarkEntryKey,
  saveMarksheetEntries,
} from '../../services/marksheet/storage';
import {
  GradingSystemType,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  OptionalElective,
  OptionalLanguage,
  StudentMarkEntry,
  SubjectKey,
} from '../../services/marksheet/types';
import { applySchoolConfigToMarksheetConfig } from '../../services/schoolConfig/propagation';
import { useMarksheetEditing } from './useMarksheetEditing';
import { useMarksheetExports } from './useMarksheetExports';
import { useMarksheetLiveSync } from './useMarksheetLiveSync';

export type MarksheetViewTab = 'marksheet' | 'results-list';

export interface MarksheetInitialTarget {
  grNo: string;
  gradeLevel?: MarksheetGradeLevel;
  examType?: MarksheetExamType;
}

export function useMarksheetsState(
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  initialTarget?: MarksheetInitialTarget | null
) {
  const [activeTab, setActiveTab] = useState<MarksheetViewTab>('marksheet');
  const [sheetRecords, setSheetRecords] = useState<StudentRecord[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(true);
  const [config, setConfig] = useState<MarksheetConfig>(() => loadMarksheetConfig());
  const [entriesMap, setEntriesMap] = useState<Record<string, StudentMarkEntry>>(() =>
    loadMarksheetEntries()
  );

  const [examType, setExamType] = useState<MarksheetExamType>(
    () => initialTarget?.examType || 'midterm'
  );
  const [gradingSystem, setGradingSystem] = useState<GradingSystemType>(
    () => loadMarksheetConfig().activeGradingSystem || 'zueb'
  );
  const [gradeFilter, setGradeFilter] = useState<'ALL' | MarksheetGradeLevel>(
    () => initialTarget?.gradeLevel || 'ALL'
  );
  const [resultsGrade, setResultsGrade] = useState<MarksheetGradeLevel>(
    () => initialTarget?.gradeLevel || 'IX'
  );
  const [resultsSubject, setResultsSubject] = useState<SubjectKey>('mathematics');

  const [searchQuery, setSearchQuery] = useState('');
  const [grInput, setGrInput] = useState(() => initialTarget?.grNo || '');
  const [selectedGrNo, setSelectedGrNo] = useState<string>(() => initialTarget?.grNo || '');
  const [logos, setLogos] = useState<MarksheetLogoAssets>({});

  const liveSync = useMarksheetLiveSync({
    setConfig,
    setEntriesMap,
    setGradingSystem,
    showToast,
  });

  const { updateStudentSubjectScore, updateStudentOptionals } = useMarksheetEditing({
    examType,
    setEntriesMap,
    pendingEdits: liveSync.pendingEdits,
    currentUser: liveSync.currentUser,
    getBaseEntry: liveSync.getBaseEntry,
    persistPendingEdit: liveSync.persistPendingEdit,
    showToast,
  });

  useEffect(() => {
    if (gradeFilter !== 'ALL') {
      setResultsGrade(gradeFilter);
    }
  }, [gradeFilter]);

  useEffect(() => {
    const validSubjects = getSubjectsForGrade(resultsGrade);
    if (!validSubjects.includes(resultsSubject)) {
      if (resultsSubject === 'islamicStudies' && validSubjects.includes('pakistanStudies')) {
        setResultsSubject('pakistanStudies');
      } else if (resultsSubject === 'pakistanStudies' && validSubjects.includes('islamicStudies')) {
        setResultsSubject('islamicStudies');
      } else {
        setResultsSubject(validSubjects[0]);
      }
    }
  }, [resultsGrade, resultsSubject]);

  useEffect(() => {
    if (!initialTarget?.grNo) return;
    if (initialTarget.examType) setExamType(initialTarget.examType);
    if (initialTarget.gradeLevel) {
      setGradeFilter(initialTarget.gradeLevel);
      setResultsGrade(initialTarget.gradeLevel);
    }
    setSelectedGrNo(initialTarget.grNo);
    setGrInput(initialTarget.grNo);
  }, [initialTarget?.grNo, initialTarget?.gradeLevel, initialTarget?.examType]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchSheetData()
        .then((res) => {
          if (active) setSheetRecords(res.records || []);
        })
        .catch((err) => {
          console.warn('[marksheets] Failed to fetch student register:', err);
        }),
      fetchMarksheetLogoAssets().then((assets) => {
        if (active) setLogos(assets);
      }),
    ]).finally(() => {
      if (active) setIsLoadingRoster(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const examEntriesByGr = useMemo(() => {
    const out: Record<string, StudentMarkEntry> = {};
    const prefix = `${examType}::`;
    (Object.entries(entriesMap) as Array<[string, StudentMarkEntry]>).forEach(([k, val]) => {
      if (k.startsWith(prefix)) {
        out[normalizeGrKey(val.grNo)] = val;
        out[val.grNo] = val;
      }
    });
    return out;
  }, [entriesMap, examType]);

  const roster = useMemo(
    () => buildMarksheetRoster(sheetRecords, examEntriesByGr, gradeFilter, searchQuery),
    [sheetRecords, examEntriesByGr, gradeFilter, searchQuery]
  );

  const resultsClassRoster = useMemo(
    () => buildMarksheetRoster(sheetRecords, examEntriesByGr, resultsGrade, ''),
    [sheetRecords, examEntriesByGr, resultsGrade]
  );

  const selectedIndex = useMemo(() => {
    if (!roster.length) return -1;
    const targetKey = normalizeGrKey(selectedGrNo);
    const idx = roster.findIndex((s) => normalizeGrKey(s.grNo) === targetKey);
    return idx >= 0 ? idx : 0;
  }, [roster, selectedGrNo]);

  const activeStudent = selectedIndex >= 0 ? roster[selectedIndex] : null;

  useEffect(() => {
    if (activeStudent && selectedGrNo !== activeStudent.grNo) {
      setSelectedGrNo(activeStudent.grNo);
      setGrInput(activeStudent.grNo);
    }
  }, [activeStudent, selectedGrNo]);

  const selectStudentByGr = useCallback(
    (gr: string) => {
      const trimmed = gr.trim();
      setGrInput(gr);
      if (!trimmed) return;
      const targetKey = normalizeGrKey(trimmed);
      const exact = roster.find((s) => normalizeGrKey(s.grNo) === targetKey);
      if (exact) {
        setSelectedGrNo(exact.grNo);
        return;
      }
      const fullRoster = buildMarksheetRoster(sheetRecords, examEntriesByGr, 'ALL', '');
      const fullMatch = fullRoster.find((s) => normalizeGrKey(s.grNo) === targetKey);
      if (fullMatch) {
        setGradeFilter('ALL');
        setSearchQuery('');
        setSelectedGrNo(fullMatch.grNo);
      }
    },
    [roster, sheetRecords, examEntriesByGr]
  );

  const openStudentMarksheet = useCallback(
    (grNo: string, gradeLevel: MarksheetGradeLevel) => {
      setGradeFilter((prev) => (prev === 'ALL' || prev === gradeLevel ? prev : 'ALL'));
      setSearchQuery('');
      setSelectedGrNo(grNo);
      setGrInput(grNo);
      setActiveTab('marksheet');
    },
    []
  );

  const createCustomStudentByGr = useCallback(
    (gr: string, gradeLevel: MarksheetGradeLevel, studentName?: string) => {
      if (!liveSync.isAdmin) return;
      const cleanGr = gr.trim();
      if (!cleanGr) return;
      const cleanName = (studentName || '').trim() || `Student GR ${cleanGr}`;
      const key = makeMarkEntryKey(cleanGr, examType);
      setEntriesMap((prev) => {
        const existing = prev[key];
        const nextEntry: StudentMarkEntry = {
          ...(existing || {}),
          grNo: cleanGr,
          studentName: existing?.studentName || cleanName,
          currentClass: gradeLevel,
          scores: existing?.scores || {},
          examType,
          updatedAt: Date.now(),
        };
        const nextMap = { ...prev, [key]: nextEntry };
        saveMarksheetEntries(nextMap);
        return nextMap;
      });
      setGradeFilter((prev) => (prev === 'ALL' || prev === gradeLevel ? prev : 'ALL'));
      setSearchQuery('');
      setSelectedGrNo(cleanGr);
      setGrInput(cleanGr);
      showToast(`Added GR ${cleanGr} (${gradeLevel}) to local preview.`, 'info');
    },
    [examType, liveSync.isAdmin, showToast]
  );

  const unmatchedGrQuery = useMemo(() => {
    const q = grInput.trim();
    if (!q) return '';
    const qNorm = normalizeGrKey(q);
    if (activeStudent && normalizeGrKey(activeStudent.grNo) === qNorm) return '';
    const fullRoster = buildMarksheetRoster(sheetRecords, examEntriesByGr, 'ALL', '');
    return fullRoster.some((s) => normalizeGrKey(s.grNo) === qNorm) ? '' : q;
  }, [grInput, activeStudent, sheetRecords, examEntriesByGr]);

  const goToPrevStudent = useCallback(() => {
    if (!roster.length) return;
    const prevIdx = selectedIndex > 0 ? selectedIndex - 1 : roster.length - 1;
    const next = roster[prevIdx];
    setSelectedGrNo(next.grNo);
    setGrInput(next.grNo);
  }, [roster, selectedIndex]);

  const goToNextStudent = useCallback(() => {
    if (!roster.length) return;
    const nextIdx = selectedIndex < roster.length - 1 ? selectedIndex + 1 : 0;
    const next = roster[nextIdx];
    setSelectedGrNo(next.grNo);
    setGrInput(next.grNo);
  }, [roster, selectedIndex]);

  const effectiveConfig = useMemo(
    () => applySchoolConfigToMarksheetConfig(config, liveSync.schoolConfig),
    [config, liveSync.schoolConfig]
  );

  const activeEntry = activeStudent
    ? examEntriesByGr[activeStudent.grNo] || examEntriesByGr[normalizeGrKey(activeStudent.grNo)]
    : undefined;
  const activeMarksheet = useMemo(() => {
    if (!activeStudent) return null;
    return computeStudentMarksheet(activeStudent, activeEntry, effectiveConfig, examType, gradingSystem);
  }, [activeStudent, activeEntry, effectiveConfig, examType, gradingSystem]);

  const hasActivePendingEdit = useMemo(() => {
    if (!activeStudent) return false;
    const activeGrNorm = normalizeGrKey(activeStudent.grNo);
    return liveSync.pendingEdits.some(
      (e) => e.examType === examType && normalizeGrKey(e.grNo) === activeGrNorm
    );
  }, [activeStudent, examType, liveSync.pendingEdits]);

  const updateSubjectScore = useCallback(
    (subject: SubjectKey, rawValue: string) => {
      if (!activeStudent) return;
      updateStudentSubjectScore(activeStudent, subject, rawValue);
    },
    [activeStudent, updateStudentSubjectScore]
  );

  const updateOptionalLanguage = useCallback(
    (lang: OptionalLanguage) => {
      if (!activeStudent) return;
      updateStudentOptionals(activeStudent, { optionalLanguage: lang });
    },
    [activeStudent, updateStudentOptionals]
  );

  const updateOptionalElective = useCallback(
    (elective: OptionalElective) => {
      if (!activeStudent) return;
      updateStudentOptionals(activeStudent, { optionalElective: elective });
    },
    [activeStudent, updateStudentOptionals]
  );

  const {
    handleImportFile,
    handleDownloadSinglePdf,
    handleDownloadAllPdf,
    isExportingSingle,
    batchProgress,
  } = useMarksheetExports({
    isAdmin: liveSync.isAdmin,
    examType,
    gradingSystem,
    gradeFilter,
    config: effectiveConfig,
    setConfig,
    setEntriesMap,
    setSelectedGrNo,
    setGrInput,
    roster,
    examEntriesByGr,
    activeMarksheet,
    logos,
    showToast,
  });

  return {
    activeTab,
    setActiveTab,
    isLoadingRoster,
    isAdmin: liveSync.isAdmin,
    isSignedIn: liveSync.isSignedIn,
    activeSpreadsheetUrl: liveSync.activeSpreadsheetUrl,
    isCustomSpreadsheet: liveSync.isCustomSpreadsheet,
    isSavingSheetLink: liveSync.isSavingSheetLink,
    isSyncingLive: liveSync.isSyncingLive,
    isPushingPending: liveSync.isPushingPending,
    pushingDocId: liveSync.pushingDocId,
    syncError: liveSync.syncError,
    syncNeedsAuth: liveSync.syncNeedsAuth,
    pendingEdits: liveSync.pendingEdits,
    hasActivePendingEdit,
    checkAndSyncFromSheet: liveSync.checkAndSyncFromSheet,
    connectGoogleAndSync: liveSync.connectGoogleAndSync,
    replaceSyncedSheetLink: liveSync.replaceSyncedSheetLink,
    resetSyncedSheetLink: liveSync.resetSyncedSheetLink,
    pushPendingToSheet: liveSync.pushPendingToSheet,
    discardPendingEdit: liveSync.discardPendingEdit,
    config: effectiveConfig,
    examType,
    setExamType,
    gradingSystem,
    setGradingSystem,
    gradeFilter,
    setGradeFilter,
    resultsGrade,
    setResultsGrade,
    resultsSubject,
    setResultsSubject,
    resultsClassRoster,
    examEntriesByGr,
    searchQuery,
    setSearchQuery,
    grInput,
    setGrInput,
    unmatchedGrQuery,
    selectStudentByGr,
    openStudentMarksheet,
    createCustomStudentByGr,
    roster,
    selectedIndex,
    activeStudent,
    activeMarksheet,
    goToPrevStudent,
    goToNextStudent,
    updateSubjectScore,
    updateOptionalLanguage,
    updateOptionalElective,
    updateStudentSubjectScore,
    updateStudentOptionals,
    handleImportFile,
    handleDownloadSinglePdf,
    handleDownloadAllPdf,
    isExportingSingle,
    batchProgress,
  };
}

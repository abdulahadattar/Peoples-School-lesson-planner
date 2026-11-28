import { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  StudentRecord,
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_GID,
  fetchSheetData,
  peekCachedSheetData,
} from '../../services/googleSheetsService';
import { fetchAllDossiers, peekCachedDossiers } from '../../services/documentClientService';
import {
  subscribeSharedEdits,
  applySharedEdits,
  setMirrorErrorHandler,
  type SharedRecordEdit,
} from '../../services/sharedRecordEdits';
import {
  shouldPullSheet,
  markSheetPulled,
  SHEET_PULL_CHECK_MS,
  SHEET_PULL_INTERVAL_MS,
} from '../../services/sheetPullSchedule';
import { StudentDossier } from '../../types/documentArchive';
import { normalizeGrKey } from '../../services/identityNormalization';
import { SortField, SortDirection } from './types';
import { getAccessToken } from '../../services/googleAuth';
import {
  filterStudentRecords,
  sortStudentRecords,
  calculateStudentStats,
} from './recordSortAndFilter';
import { useRecordsGoogleAuth } from './useRecordsGoogleAuth';
import { toUserErrorMessage } from '../../utils/userMessage';

export function useStudentRecords(
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void
) {
  const initialSheet = peekCachedSheetData(
    DEFAULT_SPREADSHEET_ID,
    DEFAULT_GID,
    null,
    SHEET_PULL_INTERVAL_MS
  );
  const [records, setRecords] = useState<StudentRecord[]>(() => initialSheet?.records || []);
  const sheetRecordsRef = useRef<StudentRecord[]>(initialSheet?.records || []);
  const sharedEditsRef = useRef<SharedRecordEdit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() => !initialSheet);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(() => initialSheet?.lastSynced || null);

  // Google Auth state
  const {
    authUser,
    authToken,
    isAuthLoading,
    handleSignIn,
    handleSignOut,
  } = useRecordsGoogleAuth(showNotification);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('grNo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Document Dossier state
  const [dossiersByGr, setDossiersByGr] = useState<Record<string, StudentDossier>>(() => {
    const cachedDossiers = peekCachedDossiers();
    if (!cachedDossiers) return {};
    const dMap: Record<string, StudentDossier> = {};
    for (const d of cachedDossiers) {
      if (d.grNo) {
        dMap[normalizeGrKey(String(d.grNo))] = d;
      }
    }
    return dMap;
  });
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  useEffect(() => {
    setMirrorErrorHandler((message) => showNotification(message, 'error'));
    return () => setMirrorErrorHandler(null);
  }, [showNotification]);

  useEffect(() => {
    return subscribeSharedEdits((edits) => {
      const previousCount = sharedEditsRef.current.length;
      sharedEditsRef.current = edits;

      if (edits.length < previousCount) {
        void loadRecords(true, true);
        return;
      }

      if (sheetRecordsRef.current.length === 0) return;
      setRecords(applySharedEdits(sheetRecordsRef.current, edits));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRecords = async (isManualRefresh = false, silent = false) => {
    if (isManualRefresh && !silent) setIsRefreshing(true);
    else if (!isManualRefresh && sheetRecordsRef.current.length === 0) setIsLoading(true);
    setError(null);

    try {
      const token = authToken || (await getAccessToken());
      const [sheetResult, dossiersResult] = await Promise.allSettled([
        fetchSheetData(
          DEFAULT_SPREADSHEET_ID,
          DEFAULT_GID,
          token,
          isManualRefresh,
          SHEET_PULL_INTERVAL_MS
        ),
        fetchAllDossiers(),
      ]);

      if (sheetResult.status === 'fulfilled') {
        sheetRecordsRef.current = sheetResult.value.records;
        setRecords(applySharedEdits(sheetResult.value.records, sharedEditsRef.current));
        setLastSynced(sheetResult.value.lastSynced);
        if (isManualRefresh) {
          markSheetPulled();
          if (!silent) {
            showNotification(`Loaded ${sheetResult.value.records.length} student records.`);
          }
        }
      } else {
        throw sheetResult.reason;
      }

      if (dossiersResult.status === 'fulfilled') {
        const dMap: Record<string, StudentDossier> = {};
        for (const d of dossiersResult.value) {
          if (d.grNo) {
            dMap[normalizeGrKey(String(d.grNo))] = d;
          }
        }
        setDossiersByGr(dMap);
      }
    } catch (err: any) {
      console.error('Failed to load student records:', err);
      setError(toUserErrorMessage(err, 'Failed to load student records.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const forceScheduledPull = shouldPullSheet();
    void loadRecords(forceScheduledPull, sheetRecordsRef.current.length > 0 && forceScheduledPull);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (shouldPullSheet()) void loadRecords(true, true);
    }, SHEET_PULL_CHECK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.currentClass) set.add(r.currentClass.trim());
    });
    return Array.from(set).sort();
  }, [records]);

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.section) set.add(r.section.trim());
    });
    return Array.from(set).sort();
  }, [records]);

  const statusOptions = useMemo(() => {
    return ['New Enrollment', 'Promoted', 'DROP OUT'];
  }, []);

  const filteredRecords = useMemo(() => {
    return filterStudentRecords(records, {
      searchQuery,
      selectedClass,
      selectedSection,
      selectedStatus,
      selectedGender,
    });
  }, [records, searchQuery, selectedClass, selectedSection, selectedStatus, selectedGender]);

  const sortedAndFilteredRecords = useMemo(() => {
    return sortStudentRecords(filteredRecords, sortField, sortDirection);
  }, [filteredRecords, sortField, sortDirection]);

  const stats = useMemo(() => {
    return calculateStudentStats(records);
  }, [records]);

  const totalPages = Math.ceil(sortedAndFilteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAndFilteredRecords.slice(start, start + pageSize);
  }, [sortedAndFilteredRecords, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClass, selectedSection, selectedStatus, selectedGender, pageSize, sortField, sortDirection]);

  return {
    records,
    isLoading,
    isRefreshing,
    error,
    lastSynced,
    authUser,
    authToken,
    isAuthLoading,
    handleSignIn,
    handleSignOut,
    searchQuery,
    setSearchQuery,
    selectedClass,
    setSelectedClass,
    classOptions,
    selectedSection,
    setSelectedSection,
    sectionOptions,
    selectedStatus,
    setSelectedStatus,
    statusOptions,
    selectedGender,
    setSelectedGender,
    sortField,
    sortDirection,
    handleSort,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    dossiersByGr,
    viewMode,
    setViewMode,
    stats,
    filteredRecords,
    paginatedRecords,
    loadRecords,
  };
}

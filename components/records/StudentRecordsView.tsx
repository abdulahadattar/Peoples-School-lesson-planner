import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Download,
  ExternalLink,
  Edit2,
  Eye,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Users,
  GraduationCap,
  FileSpreadsheet,
  X,
  Phone,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  BarChart3,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  ZoomIn,
  FolderOpen,
  LayoutGrid,
  List,
  FileText,
  Camera,
} from 'lucide-react';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import {
  StudentRecord,
  DEFAULT_SPREADSHEET_URL,
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_GID,
  DEFAULT_SHEET_TITLE,
  fetchSheetData,
  exportRecordsToCSV,
  classifySheetsWriteError,
} from '../../services/googleSheetsService';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  getCurrentUser,
} from '../../services/googleAuth';
import { fetchAllDossiers } from '../../services/documentClientService';
import {
  publishSharedEdit,
  subscribeSharedEdits,
  applySharedEdits,
  setMirrorErrorHandler,
  type SharedRecordEdit,
} from '../../services/sharedRecordEdits';
import { shouldPullSheet, markSheetPulled, SHEET_PULL_CHECK_MS, SHEET_PULL_INTERVAL_MS } from '../../services/sheetPullSchedule';
import { StudentDossier } from '../../types/documentArchive';
import { GoogleSignInButton } from './GoogleSignInButton';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentEditModal } from './StudentEditModal';
import { ConfirmationModal, DiffItem } from './ConfirmationModal';
import { ClassAnalyticsCharts, CLASS_ORDER } from './ClassAnalyticsCharts';
import { StudentAvatar, resolveAvatarUrl } from './StudentAvatar';
import { RecordsStatsStrip } from './RecordsStatsStrip';
import { RecordsFilterToolbar } from './RecordsFilterToolbar';
import { RecordsTableRow } from './RecordsTableRow';
import { StudentCardGrid } from './StudentCardGrid';
import { SortableTableHeader } from '../ui/SortableTableHeader';
import { Pagination } from '../ui/Pagination';
import { getStudentStatusBadgeClass } from '../attendance/attendanceUtils';
import { normalizeGrKey } from '../../services/identityNormalization';
import { User } from 'firebase/auth';

export type SortField =
  | 'grNo'
  | 'studentName'
  | 'fatherName'
  | 'currentClass'
  | 'gender'
  | 'dob'
  | 'parentContact'
  | 'emergencyContact'
  | 'status'
  | 'bFormNo'
  | 'parentCnic'
  | 'address';

export type SortDirection = 'asc' | 'desc';

export const StudentRecordsView: React.FC = () => {
  const { config: schoolConfig, isAdmin, saveConfig } = useSchoolConfig();
  const [records, setRecords] = useState<StudentRecord[]>([]);
  // The rows exactly as the sheet returned them, before unsynced local edits
  // were layered on top. The overlay must be re-applied from this copy and not
  // from `records`: once a queued write lands, its overlay entry is cleared, and
  // re-applying onto already-overlaid rows would keep showing the local value
  // forever - the exact staleness the overlay exists to prevent.
  const sheetRecordsRef = useRef<StudentRecord[]>([]);
  /** Pending edits published by other teachers. Held in a ref so the loader can
   *  read the latest set without being re-created on every change. */
  const sharedEditsRef = useRef<SharedRecordEdit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Google Auth state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('grNo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 text-brand-text-secondary/40 opacity-0 group-hover/th:opacity-100 transition-opacity ml-1 flex-shrink-0" />
      );
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-brand-primary ml-1 flex-shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-brand-primary ml-1 flex-shrink-0" />
    );
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Modals
  const [detailStudent, setDetailStudent] = useState<StudentRecord | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<'details' | 'documents'>('details');
  const [editStudent, setEditStudent] = useState<StudentRecord | null>(null);
  const [isAddMode, setIsAddMode] = useState<boolean>(false);

  // Document Dossier & Avatar state
  const [dossiersByGr, setDossiersByGr] = useState<Record<string, StudentDossier>>({});
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<{ url: string; name: string; grNo: string } | null>(null);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');

  // Confirmation modal state
  const [confirmationState, setConfirmationState] = useState<{
    isOpen: boolean;
    title: string;
    student: StudentRecord | null;
    diffs: DiffItem[];
    isAdd: boolean;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    title: '',
    student: null,
    diffs: [],
    isAdd: false,
    isSubmitting: false,
  });

  // Notifications
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // Init Auth on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setAuthUser(user);
        setAuthToken(token);
      },
      () => {
        setAuthUser(null);
        setAuthToken(null);
      }
    );

    const current = getCurrentUser();
    if (current) setAuthUser(current);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  /**
   * Surface shared-store failures to the teacher.
   *
   * `services/sharedRecordEdits` reports every problem through this hook. Without
   * a subscriber those reports were `console.warn` only, which a teacher never
   * sees - so a failed mirror looked identical to a successful save.
   */
  useEffect(() => {
    setMirrorErrorHandler((message) => showNotification(message, 'error'));
    return () => setMirrorErrorHandler(null);
  }, []);

  /**
   * Pending edits from Firestore, live.
   *
   * Records no longer use a device-local overlay. A localStorage copy is visible
   * only in the browser that made it, disappears when that browser's data is
   * cleared, and is tied to one device - none of which is acceptable for the
   * official register. The pending edit lives in `student_record_edits`, so the
   * teacher who made it, every other signed-in teacher, and every device read the
   * same value from the moment it is saved.
   */
  useEffect(() => {
    return subscribeSharedEdits((edits) => {
      const previousCount = sharedEditsRef.current.length;
      sharedEditsRef.current = edits;

      // The pending set SHRANK, so at least one edit has just been accepted by the
      // sheet - here or on another device. `sheetRecordsRef` still holds the
      // pre-sync base, so merging over it would leave accepted rows showing their
      // old values until the next scheduled pull, up to 12 hours later.
      //
      // Deliberately "fewer", not "none": a partial sync that cleared one of two
      // edits leaves that one row stale, and waiting for the count to hit zero
      // would leave it stale for good if the other edit kept failing.
      if (edits.length < previousCount) {
        void loadRecords(true, true);
        return;
      }

      if (sheetRecordsRef.current.length === 0) return;
      setRecords(applySharedEdits(sheetRecordsRef.current, edits));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch initial sheet data & student document dossiers
  const loadRecords = async (isManualRefresh = false, silent = false) => {
    // A silent reload is a correction (e.g. after a sync landed), not user
    // action: it must not flash a spinner or announce itself.
    if (isManualRefresh && !silent) setIsRefreshing(true);
    else if (!isManualRefresh) setIsLoading(true);
    setError(null);

    try {
      const token = authToken || (await getAccessToken());
      const [sheetResult, dossiersResult] = await Promise.allSettled([
        // The 12-hour window is passed as the cache's max age so that opening the
        // view inside the window serves the cache and issues NO request at all.
        // Without this the service's own 10-minute TTL would still hit the
        // network, which is not the behaviour the schedule promises.
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
        // Layering order is sheet -> other teachers' pending edits -> this
        // teacher's own unsynced edits, so the person looking at the screen
        // always sees their own work but never loses sight of everyone else's.
        sheetRecordsRef.current = sheetResult.value.records;
        setRecords(applySharedEdits(sheetResult.value.records, sharedEditsRef.current));
        setLastSynced(sheetResult.value.lastSynced);
        if (isManualRefresh) {
          // Only a deliberate pull resets the 12-hour clock. Recording a
          // cache-served read here would delay the next real pull by 12 hours.
          markSheetPulled();
          if (!silent) {
            showNotification(`Successfully synchronized ${sheetResult.value.records.length} records from Google Sheet.`);
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
      console.error('Failed to load Google Sheet data:', err);
      setError(err?.message || 'Failed to load records from Google Sheet.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // A real network read only when the cached register is older than the 12-hour
    // window (or has no recorded timestamp); otherwise the cached copy is shown
    // and the timer below handles the next scheduled pull. This replaces
    // re-downloading the entire sheet after every single edit.
    void loadRecords(shouldPullSheet());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The 12-hour pull, checked rather than polled.
   *
   * Each tick is a timestamp comparison with no network cost, and a fetch happens
   * only once the window has genuinely elapsed. A teacher who leaves the app open
   * all day therefore still picks up sheet-side edits, without the request storm
   * the old per-edit reload caused.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (shouldPullSheet()) void loadRecords(true);
    }, SHEET_PULL_CHECK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setAuthUser(res.user);
        setAuthToken(res.accessToken);
        showNotification(`Signed in as ${res.user.displayName || res.user.email}. Direct Google Sheets sync enabled!`);
      }
      // If res is null, the user deliberately closed or dismissed the prompt, so no error notification is needed.
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/user-cancelled'
      ) {
        return;
      }
      showNotification(err?.message || 'Google Sign-In failed.', 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setAuthUser(null);
      setAuthToken(null);
      showNotification('Disconnected from Google Account.', 'info');
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  // Unique options for filters extracted from actual data
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
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.status) set.add(r.status.trim());
    });
    return Array.from(set).sort();
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return records.filter((r) => {
      // Search query matching
      if (q) {
        const matchesName = r.studentName.toLowerCase().includes(q);
        const matchesFather = r.fatherName.toLowerCase().includes(q);
        const matchesGr = r.grNo.toLowerCase().includes(q);
        const matchesContact =
          r.parentContact.toLowerCase().includes(q) ||
          r.emergencyContact.toLowerCase().includes(q) ||
          r.partnerContact.toLowerCase().includes(q);
        const matchesBform = r.bFormNo.toLowerCase().includes(q);
        const matchesCnic = r.parentCnic.toLowerCase().includes(q);
        const matchesAddress = r.address.toLowerCase().includes(q);

        if (
          !matchesName &&
          !matchesFather &&
          !matchesGr &&
          !matchesContact &&
          !matchesBform &&
          !matchesCnic &&
          !matchesAddress
        ) {
          return false;
        }
      }

      // Class filter
      if (selectedClass !== 'all' && r.currentClass.trim() !== selectedClass) {
        return false;
      }

      // Section filter
      if (selectedSection !== 'all' && r.section.trim() !== selectedSection) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && r.status.trim() !== selectedStatus) {
        return false;
      }

      // Gender filter
      if (selectedGender !== 'all' && r.gender.toLowerCase() !== selectedGender.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [records, searchQuery, selectedClass, selectedSection, selectedStatus, selectedGender]);

  // Sorted and Filtered records
  const sortedAndFilteredRecords = useMemo(() => {
    const list = [...filteredRecords];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'grNo': {
          const numA = parseInt((a.grNo || '').replace(/\D/g, ''), 10);
          const numB = parseInt((b.grNo || '').replace(/\D/g, ''), 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            cmp = numA - numB;
          } else {
            cmp = (a.grNo || '').localeCompare(b.grNo || '', undefined, { numeric: true });
          }
          break;
        }
        case 'studentName':
          cmp = (a.studentName || '').localeCompare(b.studentName || '', undefined, { sensitivity: 'base' });
          break;
        case 'fatherName':
          cmp = (a.fatherName || '').localeCompare(b.fatherName || '', undefined, { sensitivity: 'base' });
          break;
        case 'currentClass': {
          const orderA = CLASS_ORDER[(a.currentClass || '').trim().toUpperCase()] ?? 99;
          const orderB = CLASS_ORDER[(b.currentClass || '').trim().toUpperCase()] ?? 99;
          if (orderA !== orderB) {
            cmp = orderA - orderB;
          } else {
            cmp = (a.section || '').localeCompare(b.section || '');
          }
          break;
        }
        case 'gender':
          cmp = (a.gender || '').localeCompare(b.gender || '');
          break;
        case 'dob': {
          const yA = parseInt(a.dobYear, 10) || 0;
          const mA = parseInt(a.dobMonth, 10) || 0;
          const dA = parseInt(a.dobDay, 10) || 0;
          const yB = parseInt(b.dobYear, 10) || 0;
          const mB = parseInt(b.dobMonth, 10) || 0;
          const dB = parseInt(b.dobDay, 10) || 0;
          cmp = (yA * 10000 + mA * 100 + dA) - (yB * 10000 + mB * 100 + dB);
          break;
        }
        case 'parentContact':
          cmp = (a.parentContact || '').localeCompare(b.parentContact || '');
          break;
        case 'emergencyContact':
          cmp = (a.emergencyContact || '').localeCompare(b.emergencyContact || '');
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'bFormNo':
          cmp = (a.bFormNo || '').localeCompare(b.bFormNo || '');
          break;
        case 'parentCnic':
          cmp = (a.parentCnic || '').localeCompare(b.parentCnic || '');
          break;
        case 'address':
          cmp = (a.address || '').localeCompare(b.address || '');
          break;
        default:
          cmp = 0;
      }

      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [filteredRecords, sortField, sortDirection]);

  // Statistics
  const stats = useMemo(() => {
    let promoted = 0;
    let newEnrollment = 0;
    let dropOut = 0;
    let male = 0;
    let female = 0;

    records.forEach((r) => {
      const s = (r.status || '').toLowerCase();
      if (s.includes('promot') || s.includes('active')) promoted++;
      else if (s.includes('new') || s.includes('enroll')) newEnrollment++;
      else if (s.includes('drop') || s.includes('struck') || s.includes('left')) dropOut++;

      const g = (r.gender || '').toLowerCase();
      if (g.startsWith('m')) male++;
      else if (g.startsWith('f')) female++;
    });

    return {
      total: records.length,
      promoted,
      newEnrollment,
      dropOut,
      male,
      female,
    };
  }, [records]);

  // Pagination calculation
  const totalPages = Math.ceil(sortedAndFilteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAndFilteredRecords.slice(start, start + pageSize);
  }, [sortedAndFilteredRecords, currentPage, pageSize]);

  // Reset page when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedClass, selectedSection, selectedStatus, selectedGender, pageSize, sortField, sortDirection]);

  const isSheetEditingLocked = !schoolConfig.sheetEditingEnabled && !isAdmin;

  // Open Edit flow
  const handleOpenEdit = (student: StudentRecord) => {
    if (isSheetEditingLocked) {
      showNotification(
        schoolConfig.sheetEditingLockedMessage ||
          'Student records editing is locked by School Administration. View-only access is active.',
        'error'
      );
      return;
    }
    setIsAddMode(false);
    setEditStudent(student);
  };

  // Open Add Student flow
  const handleOpenAdd = () => {
    if (isSheetEditingLocked) {
      showNotification(
        schoolConfig.sheetEditingLockedMessage ||
          'Student records addition is locked by School Administration. View-only access is active.',
        'error'
      );
      return;
    }
    setIsAddMode(true);
    setEditStudent(null);
  };

  // Request Confirmation before mutating (Mandatory per Workspace skill)
  const handleRequestConfirm = (
    updatedRecord: StudentRecord,
    diffs: DiffItem[],
    isAdd: boolean
  ) => {
    setEditStudent(null);
    setConfirmationState({
      isOpen: true,
      title: isAdd ? 'Confirm Adding New Student Record' : 'Confirm Updating Student Record',
      student: updatedRecord,
      diffs,
      isAdd,
      isSubmitting: false,
    });
  };

  // Execute Confirmed Mutation
  const handleExecuteConfirm = async () => {
    const { student, isAdd } = confirmationState;
    if (!student) return;

    setConfirmationState((prev) => ({ ...prev, isSubmitting: true }));

    try {
      const editorName = authUser?.displayName || authUser?.email || 'Authorized Teacher';

      // Local-first, and deliberately NOT a write to Google Sheets.
      //
      // This used to call addSheetRecord/updateSheetRecord inline and then reload
      // the entire sheet, so every single student cost one Sheets write plus a full
      // download. Worse, when the ~1 hour Sheets token had lapsed the same block
      // called googleSignIn(), so a teacher editing twenty students could be asked
      // to sign in twenty times. Nothing here touches the token now: the register
      // is written once, when the teacher presses "Sync to Sheet".
      // Firestore is the ONLY store for a pending record edit.
      //
      // This deliberately does NOT fall back to localStorage. A device-local copy
      // is invisible to other teachers, disappears when the browser is cleared,
      // and is pinned to one machine - so it presents as a saved edit that every
      // other teacher, and every future session, silently lacks. If the shared
      // write does not land, the teacher is told the change was not saved.
      const shared = await publishSharedEdit(student, isAdd ? 'add' : 'update');

      if (shared) {
        showNotification(
          `${student.studentName} saved (edit by ${editorName}). Everyone can see it now. Press "Sync to Sheet" when you are done to update the sheet itself.`,
          'success'
        );
      } else {
        showNotification(
          `Could not save ${student.studentName}: the shared records store was unreachable. ` +
            `Check your connection and that you are signed in, then try again. Nothing was changed.`,
          'error'
        );
        // Leave the dialog open so the teacher can retry rather than believing a
        // change was stored when it was not.
        setConfirmationState((prev) => ({ ...prev, isSubmitting: false }));
        return;
      }

      setConfirmationState({
        isOpen: false,
        title: '',
        student: null,
        diffs: [],
        isAdd: false,
        isSubmitting: false,
      });
    } catch (err: any) {
      // Nothing in the try block raises a Google Sheets error any more, so this
      // only catches unexpected failures (the shared write rejecting, or a bug).
      // Report plainly and keep the dialog open so the teacher can retry, rather
      // than closing it and implying the edit was stored.
      console.error('Error saving record locally:', err);
      showNotification(
        `Could not save ${student.studentName} on this device: ${err?.message || err}. The change was not stored.`,
        'error'
      );
      setConfirmationState((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const getStatusBadge = (status?: string) => (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getStudentStatusBadgeClass(
        status
      )}`}
    >
      {status || 'Active'}
    </span>
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-20 right-6 z-[130] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-glass border text-xs font-semibold animate-fadeInUp ${
            notification.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/90 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
              : notification.type === 'info'
              ? 'bg-amber-50 dark:bg-amber-950/90 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-75"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="rounded-2xl glass-card p-5 sm:p-6 border border-brand-border shadow-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-bold border border-brand-primary/20 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Google Sheets Integration</span>
            </span>
            {lastSynced && (
              <span className="text-[11px] text-brand-text-secondary">
                Last updated: {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-brand-text-primary tracking-tight">
            School Student Records & Register
          </h1>
          <p className="text-xs text-brand-text-secondary max-w-2xl leading-relaxed">
            Search, filter and edit student records. Changes sync back to the Google Sheet.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadRecords(true)}
            disabled={isRefreshing || isLoading}
            title="Refresh from Google Sheet"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary hover:border-brand-primary/40 hover:text-brand-primary shadow-soft active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-primary' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Sheet'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            disabled={isSheetEditingLocked}
            title={isSheetEditingLocked ? 'Editing locked by school admin' : 'Add Student'}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-soft transition-all ${
              isSheetEditingLocked
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'text-white bg-brand-primary hover:bg-brand-primary/90 active:scale-95'
            }`}
          >
            {isSheetEditingLocked ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Add Student</span>
          </button>

          <button
            type="button"
            onClick={() => exportRecordsToCSV(filteredRecords)}
            title="Export filtered records as CSV"
            className="inline-flex items-center gap-1.5 p-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-border shadow-soft transition-all"
          >
            <Download className="w-4 h-4" />
          </button>

          <a
            href={DEFAULT_SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original spreadsheet in Google Sheets"
            className="inline-flex items-center gap-1.5 p-2 rounded-xl text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-border shadow-soft transition-all"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Administrative Lockout / View-Only Status Banner */}
      {!schoolConfig.sheetEditingEnabled && (
        <div
          className={`p-4 rounded-2xl border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isAdmin
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
              : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex-shrink-0 ${
                isAdmin
                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h4
                className={`text-xs font-bold ${
                  isAdmin ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
                }`}
              >
                {isAdmin
                  ? 'Admin Edit Override Active'
                  : 'View-Only Mode'}
              </h4>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isAdmin ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                {isAdmin
                  ? 'Editing is locked for standard users. You can still edit as Administrator.'
                  : schoolConfig.sheetEditingLockedMessage ||
                    'Editing is locked by School Administration. You can view, search, and export.'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={async () => {
                await saveConfig({ ...schoolConfig, sheetEditingEnabled: true });
                showNotification('Google Sheet editing enabled for all school users.');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-900 transition-colors self-start sm:self-auto flex-shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock for Everyone</span>
            </button>
          )}
        </div>
      )}

      {/* Statistics Strip */}
      <RecordsStatsStrip stats={stats} />

      {/* Class Analytics & Visualizations Section */}
      <ClassAnalyticsCharts
        records={records}
        selectedClass={selectedClass}
        onSelectClass={setSelectedClass}
      />

      {/* Search and Filters Toolbar */}
      <RecordsFilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedClass={selectedClass}
        onClassChange={setSelectedClass}
        classOptions={classOptions}
        selectedSection={selectedSection}
        onSectionChange={setSelectedSection}
        sectionOptions={sectionOptions}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        statusOptions={statusOptions}
        selectedGender={selectedGender}
        onGenderChange={setSelectedGender}
        filteredCount={filteredRecords.length}
        totalCount={records.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onClearFilters={() => {
          setSearchQuery('');
          setSelectedClass('all');
          setSelectedSection('all');
          setSelectedStatus('all');
          setSelectedGender('all');
        }}
      />

      {/* Main Records Table Container */}
      <div className="rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-brand-primary animate-spin" />
            <p className="text-sm font-semibold text-brand-text-primary">Loading records from Google Sheet...</p>
            <p className="text-xs text-brand-text-secondary">Connecting to Jamshoro South Final SPD (2)...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-6 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-brand-text-primary">Failed to load Google Sheet records</h3>
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            <button
              type="button"
              onClick={() => loadRecords(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 shadow-soft"
            >
              Try Again
            </button>
          </div>
        ) : paginatedRecords.length === 0 ? (
          <div className="py-16 px-6 text-center max-w-md mx-auto space-y-2">
            <Users className="w-10 h-10 mx-auto text-brand-text-secondary/50" />
            <h3 className="text-sm font-bold text-brand-text-primary">No matching student records found</h3>
            <p className="text-xs text-brand-text-secondary">
              Try adjusting your search query or reset the class/status filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedClass('all');
                setSelectedSection('all');
                setSelectedStatus('all');
                setSelectedGender('all');
              }}
              className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-brand-bg border border-brand-border text-brand-text-primary hover:bg-brand-border transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className={`${viewMode === 'cards' ? 'hidden' : 'overflow-x-auto custom-scrollbar'}`}>
            <table className="w-full text-left border-collapse text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-brand-border bg-slate-50/80 dark:bg-slate-900/60 font-semibold text-brand-text-secondary uppercase tracking-wider text-[10px]">
                  {/* Sticky GR# column */}
                  <SortableTableHeader
                    field="grNo"
                    label="GR#"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="md:sticky md:left-0 z-20 bg-slate-50 dark:bg-slate-900 border-r border-brand-border md:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] w-20 min-w-[72px]"
                  />
                  <SortableTableHeader
                    field="studentName"
                    label="Name of Student"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[200px] border-r border-brand-border/40"
                  />
                  <SortableTableHeader
                    field="fatherName"
                    label="Father / Guardian Name"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[210px]"
                  />
                  <SortableTableHeader
                    field="currentClass"
                    label="Class & Sec"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    className="text-center min-w-[105px]"
                  />
                  <SortableTableHeader
                    field="gender"
                    label="Gender"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    className="text-center min-w-[80px]"
                  />
                  <SortableTableHeader
                    field="dob"
                    label="DOB (D/M/Y)"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    className="text-center min-w-[105px]"
                  />
                  <SortableTableHeader
                    field="parentContact"
                    label="Parent Contact"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[150px]"
                  />
                  <SortableTableHeader
                    field="emergencyContact"
                    label="Emergency Contact"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[150px]"
                  />
                  <SortableTableHeader
                    field="status"
                    label="Status"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    align="center"
                    className="text-center min-w-[120px]"
                  />
                  <SortableTableHeader
                    field="bFormNo"
                    label="B.Form No."
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[140px]"
                  />
                  <SortableTableHeader
                    field="parentCnic"
                    label="Parent CNIC"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[140px]"
                  />
                  <SortableTableHeader
                    field="address"
                    label="Address"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                    className="min-w-[200px]"
                  />
                  <th className="py-3 px-3 text-center min-w-[100px]">Class Admitted</th>
                  <th className="py-3 px-3 text-center min-w-[110px]">Admission Date</th>
                  <th className="py-3 px-4 min-w-[140px]">Partner Contact</th>
                  <th className="py-3 px-3 text-center min-w-[80px]">Shift</th>
                  <th className="py-3 px-3 text-center min-w-[90px]">Medium</th>
                  <th className="py-3 px-3 text-center min-w-[110px]">Docs & Scans</th>
                  <th className="py-3 px-3 text-center md:sticky md:right-0 z-20 bg-slate-50 dark:bg-slate-900 border-l border-brand-border md:shadow-xs w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60">
                {paginatedRecords.map((student) => {
                  const grClean = normalizeGrKey(String(student.grNo || ''));
                  return (
                    <RecordsTableRow
                      key={student.rowNumber}
                      student={student}
                      dossier={dossiersByGr[grClean]}
                      isEditingLocked={isSheetEditingLocked}
                      isAdmin={isAdmin}
                      onViewStudent={(s) => {
                        setDetailStudent(s);
                        setDetailModalTab('details');
                      }}
                      onViewDocuments={(s) => {
                        setDetailStudent(s);
                        setDetailModalTab('documents');
                      }}
                      onEditStudent={handleOpenEdit}
                      onPreviewAvatar={setAvatarPreviewUrl}
                      getStatusBadge={getStatusBadge}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile / Responsive Card Layout (Shown when viewMode === 'cards' or on mobile in 'auto' mode) */}
        {!isLoading && !error && paginatedRecords.length > 0 && (
          <StudentCardGrid
            paginatedRecords={paginatedRecords}
            dossiersByGr={dossiersByGr}
            isSheetEditingLocked={isSheetEditingLocked}
            viewMode={viewMode}
            onViewDetails={(student) => {
              setDetailStudent(student);
              setDetailModalTab('details');
            }}
            onViewDocuments={(student) => {
              setDetailStudent(student);
              setDetailModalTab('documents');
            }}
            onEditStudent={handleOpenEdit}
            onPreviewAvatar={setAvatarPreviewUrl}
            getStatusBadge={getStatusBadge}
          />
        )}

        {/* Pagination Bar */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRecords.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modals */}
      <StudentDetailModal
        isOpen={!!detailStudent}
        student={detailStudent}
        initialTab={detailModalTab}
        onClose={() => setDetailStudent(null)}
        onEdit={(student) => {
          setDetailStudent(null);
          handleOpenEdit(student);
        }}
      />

      <StudentEditModal
        isOpen={!!editStudent || isAddMode}
        student={editStudent}
        isAddMode={isAddMode}
        onClose={() => {
          setEditStudent(null);
          setIsAddMode(false);
        }}
        onRequestConfirm={handleRequestConfirm}
      />

      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        studentName={confirmationState.student?.studentName || ''}
        grNo={confirmationState.student?.grNo || ''}
        rowNumber={confirmationState.student?.rowNumber || 0}
        diffs={confirmationState.diffs}
        isSubmitting={confirmationState.isSubmitting}
        isAdd={confirmationState.isAdd}
        onConfirm={handleExecuteConfirm}
        onCancel={() =>
          setConfirmationState((prev) => ({ ...prev, isOpen: false, isSubmitting: false }))
        }
      />

      {/* Student Photo Full-Resolution Lightbox Modal */}
      {avatarPreviewUrl && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setAvatarPreviewUrl(null)}
        >
          <div
            className="bg-white dark:bg-brand-surface rounded-2xl max-w-sm w-full p-4 border border-brand-border space-y-3 shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full pb-2 border-b border-brand-border">
              <div>
                <h4 className="text-sm font-bold text-brand-text-primary">{avatarPreviewUrl.name}</h4>
                <span className="text-xs font-mono font-bold text-brand-primary">
                  GR# {avatarPreviewUrl.grNo}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAvatarPreviewUrl(null)}
                className="p-1 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-brand-bg text-brand-text-secondary active:bg-brand-bg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-64 h-64 rounded-2xl overflow-hidden border border-brand-border bg-slate-900 flex items-center justify-center shadow-inner">
              <img
                src={avatarPreviewUrl.url}
                alt={avatarPreviewUrl.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center justify-between w-full pt-1">
              <a
                href={avatarPreviewUrl.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Full Image</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  const s = records.find(
                    (r) => String(r.grNo).trim() === String(avatarPreviewUrl.grNo).trim()
                  );
                  if (s) {
                    setDetailStudent(s);
                    setDetailModalTab('documents');
                  }
                  setAvatarPreviewUrl(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors flex items-center gap-1"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>All Documents</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

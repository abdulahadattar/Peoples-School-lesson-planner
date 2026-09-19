import React, { useState, useEffect, useMemo } from 'react';
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
  updateSheetRecord,
  addSheetRecord,
  exportRecordsToCSV,
} from '../../services/googleSheetsService';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  getCurrentUser,
} from '../../services/googleAuth';
import { fetchAllDossiers } from '../../services/documentClientService';
import { StudentDossier } from '../../types/documentArchive';
import { GoogleSignInButton } from './GoogleSignInButton';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentEditModal } from './StudentEditModal';
import { ConfirmationModal, DiffItem } from './ConfirmationModal';
import { ClassAnalyticsCharts, CLASS_ORDER } from './ClassAnalyticsCharts';
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

interface StudentAvatarProps {
  name: string;
  grNo?: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const StudentAvatar: React.FC<StudentAvatarProps> = ({
  name,
  grNo = '',
  avatarUrl,
  size = 'md',
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);

  // Reset img error if avatarUrl changes
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-11 h-11 text-sm',
  }[size];

  const initials = useMemo(() => {
    if (!name) return 'S';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);

  const colorIndex = useMemo(() => {
    let hash = 0;
    const str = grNo || name || 'S';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 6;
  }, [grNo, name]);

  const bgGradients = [
    'from-indigo-600 to-blue-600 text-white',
    'from-emerald-600 to-teal-700 text-white',
    'from-violet-600 to-purple-700 text-white',
    'from-amber-600 to-orange-700 text-white',
    'from-rose-600 to-pink-700 text-white',
    'from-sky-600 to-cyan-700 text-white',
  ];

  if (avatarUrl && !imgError) {
    return (
      <div
        onClick={onClick}
        className={`${sizeClasses} rounded-full border border-brand-border/80 overflow-hidden flex-shrink-0 shadow-xs relative group/avatar ${
          onClick ? 'cursor-pointer hover:ring-2 hover:ring-brand-primary transition-all' : ''
        }`}
        title={`${name} (Click to inspect photo)`}
      >
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
        {onClick && (
          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
            <ZoomIn className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses} rounded-full bg-gradient-to-br ${bgGradients[colorIndex]} font-bold flex items-center justify-center flex-shrink-0 shadow-xs select-none border border-white/25 ${
        onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      }`}
      title={name}
    >
      {initials}
    </div>
  );
};

export const StudentRecordsView: React.FC = () => {
  const { config: schoolConfig, isAdmin, saveConfig } = useSchoolConfig();
  const [records, setRecords] = useState<StudentRecord[]>([]);
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

  // Fetch initial sheet data & student document dossiers
  const loadRecords = async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const token = authToken || (await getAccessToken());
      const [sheetResult, dossiersResult] = await Promise.allSettled([
        fetchSheetData(DEFAULT_SPREADSHEET_ID, DEFAULT_GID, token, isManualRefresh),
        fetchAllDossiers(),
      ]);

      if (sheetResult.status === 'fulfilled') {
        setRecords(sheetResult.value.records);
        setLastSynced(sheetResult.value.lastSynced);
        if (isManualRefresh) {
          showNotification(`Successfully synchronized ${sheetResult.value.records.length} records from Google Sheet.`);
        }
      } else {
        throw sheetResult.reason;
      }

      if (dossiersResult.status === 'fulfilled') {
        const dMap: Record<string, StudentDossier> = {};
        for (const d of dossiersResult.value) {
          if (d.grNo) {
            dMap[String(d.grNo).trim()] = d;
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
    loadRecords();
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
      const token = authToken || (await getAccessToken());

      if (token) {
        const editorName = authUser?.displayName || authUser?.email || 'Authorized Teacher';
        // Authenticated with Google: sync directly to spreadsheet!
        if (isAdd) {
          await addSheetRecord(student, token, DEFAULT_SPREADSHEET_ID, DEFAULT_SHEET_TITLE);
          showNotification(`Student ${student.studentName} added successfully to Google Sheet (suggestion edit by ${editorName}).`);
        } else {
          await updateSheetRecord(student, token, DEFAULT_SPREADSHEET_ID, DEFAULT_SHEET_TITLE);
          showNotification(`Row #${student.rowNumber} (${student.studentName}) updated successfully in Google Sheet (suggestion edit by ${editorName}).`);
        }
        // Reload fresh data from Google Sheet
        await loadRecords(true);
      } else {
        // Not authenticated with Google: apply update locally and explain how to sync to cloud
        if (isAdd) {
          const newStudentWithRow = {
            ...student,
            rowNumber: records.length + 2,
          };
          setRecords((prev) => [newStudentWithRow, ...prev]);
          showNotification(
            `Added ${student.studentName} to local records. Sign in with Google above to push edits directly to your spreadsheet.`,
            'info'
          );
        } else {
          setRecords((prev) =>
            prev.map((item) => (item.rowNumber === student.rowNumber ? student : item))
          );
          showNotification(
            `Updated ${student.studentName} locally. Sign in with Google above to push edits directly to your spreadsheet.`,
            'info'
          );
        }
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
      console.error('Error saving record:', err);
      const errMsg = err?.message || '';
      if (
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('403') ||
        errMsg.toLowerCase().includes('protected')
      ) {
        showNotification(
          'Google Sheet is protected or View-Only in Google Drive. You do not have direct write access to this spreadsheet in the cloud.',
          'error'
        );
      } else {
        showNotification(errMsg || 'Failed to update Google Sheet.', 'error');
      }
      setConfirmationState((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('promot') || s.includes('active')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {status}
        </span>
      );
    }
    if (s.includes('new') || s.includes('enroll')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
          {status}
        </span>
      );
    }
    if (s.includes('drop') || s.includes('struck') || s.includes('left')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        {status || 'Active'}
      </span>
    );
  };

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
            Connected to official Peoples Higher Secondary School spreadsheet. Filter, search students by name, father name, or contact number, and edit records with automatic two-way cloud sync.
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
                  ? 'Administrator Edit Override Active'
                  : 'Google Sheet Records: View-Only Safeguard Active'}
              </h4>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isAdmin ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
                }`}
              >
                {isAdmin
                  ? 'Editing is currently locked for standard users. You retain full editing privileges as Administrator.'
                  : schoolConfig.sheetEditingLockedMessage ||
                    'Student record editing and addition is locked by School Administration. You can view, search, and export student data.'}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-bold text-brand-text-secondary block">
            Total Students
          </span>
          <span className="text-xl font-extrabold text-brand-text-primary font-mono mt-0.5 block">
            {stats.total.toLocaleString()}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 block">
            Promoted / Active
          </span>
          <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 font-mono mt-0.5 block">
            {stats.promoted.toLocaleString()}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-bold text-sky-600 dark:text-sky-400 block">
            New Enrollment
          </span>
          <span className="text-xl font-extrabold text-sky-700 dark:text-sky-300 font-mono mt-0.5 block">
            {stats.newEnrollment.toLocaleString()}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-bold text-rose-600 dark:text-rose-400 block">
            Drop Outs
          </span>
          <span className="text-xl font-extrabold text-rose-700 dark:text-rose-300 font-mono mt-0.5 block">
            {stats.dropOut.toLocaleString()}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-bold text-brand-text-secondary block">
            Male Students
          </span>
          <span className="text-xl font-extrabold text-brand-text-primary font-mono mt-0.5 block">
            {stats.male.toLocaleString()}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft">
          <span className="text-[10px] uppercase tracking-wider font-bold text-brand-text-secondary block">
            Female Students
          </span>
          <span className="text-xl font-extrabold text-brand-text-primary font-mono mt-0.5 block">
            {stats.female.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Class Analytics & Visualizations Section */}
      <ClassAnalyticsCharts
        records={records}
        selectedClass={selectedClass}
        onSelectClass={setSelectedClass}
      />

      {/* Search and Filters Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-soft space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Main Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find student name, father name, contact number, GR#, B.Form, CNIC..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-xs text-brand-text-primary placeholder:text-brand-text-secondary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-secondary hover:text-brand-text-primary p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Class Filter */}
            <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded-xl px-2.5 py-1.5">
              <span className="text-brand-text-secondary font-medium">Class:</span>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="bg-transparent border-0 font-semibold text-brand-text-primary focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    Class {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded-xl px-2.5 py-1.5">
              <span className="text-brand-text-secondary font-medium">Sec:</span>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="bg-transparent border-0 font-semibold text-brand-text-primary focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                {sectionOptions.map((s) => (
                  <option key={s} value={s}>
                    Sec {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded-xl px-2.5 py-1.5">
              <span className="text-brand-text-secondary font-medium">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent border-0 font-semibold text-brand-text-primary focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Gender Filter */}
            <div className="flex items-center gap-1 bg-brand-bg border border-brand-border rounded-xl px-2.5 py-1.5">
              <span className="text-brand-text-secondary font-medium">Gender:</span>
              <select
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                className="bg-transparent border-0 font-semibold text-brand-text-primary focus:outline-hidden cursor-pointer"
              >
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            {(selectedClass !== 'all' ||
              selectedSection !== 'all' ||
              selectedStatus !== 'all' ||
              selectedGender !== 'all' ||
              searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedClass('all');
                  setSelectedSection('all');
                  setSelectedStatus('all');
                  setSelectedGender('all');
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Results summary bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-text-secondary pt-1 border-t border-brand-border/60">
          <span>
            Showing <strong className="text-brand-text-primary">{filteredRecords.length}</strong> of{' '}
            <strong className="text-brand-text-primary">{records.length}</strong> school records
          </span>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-brand-bg rounded-lg p-0.5 border border-brand-border">
              <button
                type="button"
                onClick={() => setViewMode('auto')}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                  viewMode === 'auto'
                    ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-2xs'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
                title="Auto Layout (Cards on mobile, Table on desktop)"
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-2xs'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
                title="Force Table View"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-brand-surface text-brand-primary shadow-2xs'
                    : 'text-brand-text-secondary hover:text-brand-text-primary'
                }`}
                title="Card View (Mobile Optimized)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-brand-bg border border-brand-border rounded-lg px-2 py-0.5 text-xs text-brand-text-primary focus:outline-hidden"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>
        </div>
      </div>

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
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-brand-border bg-slate-50/80 dark:bg-slate-900/60 font-semibold text-brand-text-secondary uppercase tracking-wider text-[10px]">
                  {/* Sticky GR# column only - with clean separator */}
                  <th
                    onClick={() => handleSort('grNo')}
                    className="py-3 px-3.5 sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 border-r border-brand-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] w-20 min-w-[72px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by GR#"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>GR#</span>
                      {renderSortIndicator('grNo')}
                    </div>
                  </th>

                  {/* Name of Student - Non-sticky so adjacent columns never slide under it */}
                  <th
                    onClick={() => handleSort('studentName')}
                    className="py-3 px-4 min-w-[200px] border-r border-brand-border/40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Name of Student"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Name of Student</span>
                      {renderSortIndicator('studentName')}
                    </div>
                  </th>

                  {/* Father / Guardian Name - Clean, unobstructed */}
                  <th
                    onClick={() => handleSort('fatherName')}
                    className="py-3 px-4 min-w-[210px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Father / Guardian Name"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Father / Guardian Name</span>
                      {renderSortIndicator('fatherName')}
                    </div>
                  </th>

                  {/* Class & Sec */}
                  <th
                    onClick={() => handleSort('currentClass')}
                    className="py-3 px-3 text-center min-w-[105px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Class & Section"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Class & Sec</span>
                      {renderSortIndicator('currentClass')}
                    </div>
                  </th>

                  {/* Gender */}
                  <th
                    onClick={() => handleSort('gender')}
                    className="py-3 px-3 text-center min-w-[80px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Gender"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Gender</span>
                      {renderSortIndicator('gender')}
                    </div>
                  </th>

                  {/* DOB */}
                  <th
                    onClick={() => handleSort('dob')}
                    className="py-3 px-3 text-center min-w-[105px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Date of Birth"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>DOB (D/M/Y)</span>
                      {renderSortIndicator('dob')}
                    </div>
                  </th>

                  {/* Parent Contact */}
                  <th
                    onClick={() => handleSort('parentContact')}
                    className="py-3 px-4 min-w-[150px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Parent Contact"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Parent Contact</span>
                      {renderSortIndicator('parentContact')}
                    </div>
                  </th>

                  {/* Emergency Contact */}
                  <th
                    onClick={() => handleSort('emergencyContact')}
                    className="py-3 px-4 min-w-[150px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Emergency Contact"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Emergency Contact</span>
                      {renderSortIndicator('emergencyContact')}
                    </div>
                  </th>

                  {/* Status */}
                  <th
                    onClick={() => handleSort('status')}
                    className="py-3 px-3 text-center min-w-[120px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Status"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status</span>
                      {renderSortIndicator('status')}
                    </div>
                  </th>

                  {/* B.Form No. */}
                  <th
                    onClick={() => handleSort('bFormNo')}
                    className="py-3 px-4 min-w-[140px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by B.Form No."
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>B.Form No.</span>
                      {renderSortIndicator('bFormNo')}
                    </div>
                  </th>

                  {/* Parent CNIC */}
                  <th
                    onClick={() => handleSort('parentCnic')}
                    className="py-3 px-4 min-w-[140px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Parent CNIC"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Parent CNIC</span>
                      {renderSortIndicator('parentCnic')}
                    </div>
                  </th>

                  {/* Address */}
                  <th
                    onClick={() => handleSort('address')}
                    className="py-3 px-4 min-w-[200px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none group/th"
                    title="Click to sort by Address"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Address</span>
                      {renderSortIndicator('address')}
                    </div>
                  </th>
                  <th className="py-3 px-3 text-center min-w-[100px]">Class Admitted</th>
                  <th className="py-3 px-3 text-center min-w-[110px]">Admission Date</th>
                  <th className="py-3 px-4 min-w-[140px]">Partner Contact</th>
                  <th className="py-3 px-3 text-center min-w-[80px]">Shift</th>
                  <th className="py-3 px-3 text-center min-w-[90px]">Medium</th>
                  <th className="py-3 px-3 text-center min-w-[110px]">Docs & Scans</th>
                  <th className="py-3 px-3 text-center sticky right-0 z-20 bg-slate-50 dark:bg-slate-900 border-l border-brand-border shadow-xs w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60">
                {paginatedRecords.map((student) => {
                  const grClean = String(student.grNo || '').trim();
                  const dossier = dossiersByGr[grClean];
                  const docCount = dossier?.documents?.length || 0;
                  const hasFlags = (dossier?.allFlags?.length || 0) > 0;

                  return (
                    <tr
                      key={student.rowNumber}
                      className="hover:bg-brand-bg/80 transition-colors group"
                    >
                      {/* Sticky GR# */}
                      <td className="py-2.5 px-3.5 sticky left-0 z-10 bg-white dark:bg-brand-surface group-hover:bg-brand-bg border-r border-brand-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] font-mono font-bold text-brand-primary whitespace-nowrap">
                        {student.grNo || '—'}
                      </td>

                      {/* Student Name with Circular Student Avatar */}
                      <td className="py-2.5 px-4 bg-white dark:bg-brand-surface group-hover:bg-brand-bg border-r border-brand-border/40 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar
                            name={student.studentName}
                            grNo={student.grNo}
                            avatarUrl={dossier?.avatarUrl}
                            size="md"
                            onClick={() => {
                              if (dossier?.avatarUrl) {
                                setAvatarPreviewUrl({
                                  url: dossier.avatarUrl,
                                  name: student.studentName,
                                  grNo: student.grNo,
                                });
                              } else {
                                setDetailStudent(student);
                                setDetailModalTab('details');
                              }
                            }}
                          />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailStudent(student);
                                setDetailModalTab('details');
                              }}
                              className="font-bold text-brand-text-primary hover:text-brand-primary text-left truncate block max-w-[200px] transition-colors"
                              title={student.studentName}
                            >
                              {student.studentName || '—'}
                            </button>
                            {docCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailStudent(student);
                                  setDetailModalTab('documents');
                                }}
                                className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.2 rounded transition-colors ${
                                  hasFlags
                                    ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100'
                                    : 'text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20'
                                }`}
                                title={`${docCount} documents attached${hasFlags ? ' (has discrepancies)' : ''}`}
                              >
                                <FolderOpen className="w-2.5 h-2.5" />
                                <span>{docCount} {docCount === 1 ? 'doc' : 'docs'}</span>
                                {hasFlags && <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailStudent(student);
                                  setDetailModalTab('documents');
                                }}
                                className="text-[10px] text-brand-text-secondary hover:text-brand-primary transition-colors flex items-center gap-0.5"
                                title="Attach student document scan"
                              >
                                <Camera className="w-2.5 h-2.5 opacity-60" />
                                <span>Attach</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Father / Guardian Name - Completely visible and never cut off */}
                      <td className="py-2.5 px-4 text-brand-text-primary font-medium whitespace-nowrap min-w-[210px]" title={student.fatherName}>
                        {student.fatherName || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-brand-bg border border-brand-border text-brand-text-primary">
                          {student.currentClass || '—'}
                          {student.section ? `-${student.section}` : ''}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center text-brand-text-secondary">
                        {student.gender || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-brand-text-secondary">
                        {student.dobDay && student.dobMonth && student.dobYear
                          ? `${student.dobDay}/${student.dobMonth}/${student.dobYear}`
                          : '—'}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-[11px]">
                        {student.parentContact && student.parentContact !== 'NA' && student.parentContact !== 'N/A' ? (
                          <a
                            href={`tel:${student.parentContact}`}
                            className="text-brand-primary hover:underline flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            <span>{student.parentContact}</span>
                          </a>
                        ) : (
                          <span className="text-brand-text-secondary">NA</span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-[11px]">
                        {student.emergencyContact && student.emergencyContact !== 'NA' && student.emergencyContact !== 'N/A' ? (
                          <span className="text-brand-text-primary">{student.emergencyContact}</span>
                        ) : (
                          <span className="text-brand-text-secondary">NA</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {getStatusBadge(student.status)}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-[11px] text-brand-text-secondary truncate max-w-[140px]">
                        {student.bFormNo || '—'}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-[11px] text-brand-text-secondary truncate max-w-[140px]">
                        {student.parentCnic || '—'}
                      </td>

                      <td className="py-2.5 px-4 text-brand-text-secondary text-[11px] truncate max-w-[220px]" title={student.address}>
                        {student.address || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-brand-text-secondary">
                        {student.classAdmitted || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-brand-text-secondary">
                        {student.admissionDay && student.admissionMonth && student.admissionYear
                          ? `${student.admissionDay}/${student.admissionMonth}/${student.admissionYear}`
                          : '—'}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-[11px] text-brand-text-secondary truncate max-w-[140px]">
                        {student.partnerContact || '—'}
                      </td>

                      <td className="py-2.5 px-3 text-center text-brand-text-secondary">
                        {student.shift || 'Morning'}
                      </td>

                      <td className="py-2.5 px-3 text-center text-brand-text-secondary">
                        {student.medium || 'English'}
                      </td>

                      {/* Docs & Scans Badge */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailStudent(student);
                            setDetailModalTab('documents');
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                            docCount > 0
                              ? hasFlags
                                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                              : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                          title={docCount > 0 ? `View ${docCount} documents for ${student.studentName}` : 'Attach documents'}
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>{docCount > 0 ? `${docCount} Docs` : 'Attach'}</span>
                          {hasFlags && <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center sticky right-0 z-10 bg-white dark:bg-brand-surface group-hover:bg-brand-bg border-l border-brand-border">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailStudent(student);
                              setDetailModalTab('details');
                            }}
                            title="View Profile"
                            className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDetailStudent(student);
                              setDetailModalTab('documents');
                            }}
                            title="View Documents & Scans"
                            className="p-1.5 rounded-lg text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface transition-colors"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(student)}
                            title={isSheetEditingLocked ? 'Editing locked by school admin' : 'Edit Student Record'}
                            disabled={isSheetEditingLocked}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isSheetEditingLocked
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : 'text-brand-text-secondary hover:text-brand-primary hover:bg-brand-surface'
                            }`}
                          >
                            {isSheetEditingLocked ? <Lock className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile / Responsive Card Layout (Shown when viewMode === 'cards' or on mobile in 'auto' mode) */}
        {!isLoading && !error && paginatedRecords.length > 0 && (
          <div
            className={`${
              viewMode === 'cards' ? 'block' : viewMode === 'table' ? 'hidden' : 'block lg:hidden'
            } divide-y divide-brand-border/60 bg-white dark:bg-brand-surface`}
          >
            {paginatedRecords.map((student) => {
              const grClean = String(student.grNo || '').trim();
              const dossier = dossiersByGr[grClean];
              const docCount = dossier?.documents?.length || 0;
              const hasFlags = (dossier?.allFlags?.length || 0) > 0;

              return (
                <div key={student.rowNumber} className="p-3.5 hover:bg-brand-bg/50 transition-colors space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <StudentAvatar
                        name={student.studentName}
                        grNo={student.grNo}
                        avatarUrl={dossier?.avatarUrl}
                        size="lg"
                        onClick={() => {
                          if (dossier?.avatarUrl) {
                            setAvatarPreviewUrl({
                              url: dossier.avatarUrl,
                              name: student.studentName,
                              grNo: student.grNo,
                            });
                          } else {
                            setDetailStudent(student);
                            setDetailModalTab('details');
                          }
                        }}
                      />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded border border-brand-primary/20">
                            GR# {student.grNo || '—'}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-brand-text-secondary bg-brand-bg px-1.5 py-0.5 rounded border border-brand-border">
                            {student.currentClass || '—'}{student.section ? `-${student.section}` : ''}
                          </span>
                          {getStatusBadge(student.status)}
                        </div>
                        <h4
                          onClick={() => {
                            setDetailStudent(student);
                            setDetailModalTab('details');
                          }}
                          className="font-bold text-brand-text-primary text-sm tracking-tight mt-1 hover:text-brand-primary cursor-pointer transition-colors"
                        >
                          {student.studentName || '—'}
                        </h4>
                        <p className="text-xs text-brand-text-secondary">
                          S/O {student.fatherName || '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Details & Quick Contact */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-brand-bg/60 p-2.5 rounded-xl border border-brand-border/50">
                    <div>
                      <span className="text-[10px] text-brand-text-secondary uppercase font-semibold block">Date of Birth</span>
                      <span className="font-mono text-xs text-brand-text-primary">
                        {student.dobDay && student.dobMonth && student.dobYear
                          ? `${student.dobDay}/${student.dobMonth}/${student.dobYear}`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-brand-text-secondary uppercase font-semibold block">Contact</span>
                      {student.parentContact && student.parentContact !== 'NA' && student.parentContact !== 'N/A' ? (
                        <a
                          href={`tel:${student.parentContact}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-primary font-mono hover:underline"
                        >
                          <Phone className="w-3 h-3 flex-shrink-0" />
                          <span>{student.parentContact}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-brand-text-secondary font-mono">No Phone</span>
                      )}
                    </div>
                  </div>

                  {/* Document Dossier & Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-brand-border/40">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailStudent(student);
                        setDetailModalTab('documents');
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        docCount > 0
                          ? hasFlags
                            ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{docCount > 0 ? `${docCount} Docs` : 'Attach Doc'}</span>
                      {hasFlags && <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailStudent(student);
                          setDetailModalTab('details');
                        }}
                        className="py-1.5 px-3 rounded-xl text-xs font-semibold bg-brand-bg text-brand-text-primary border border-brand-border hover:bg-brand-border/60 transition-colors"
                      >
                        Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(student)}
                        disabled={isSheetEditingLocked}
                        className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-colors ${
                          isSheetEditingLocked
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/20'
                        }`}
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {filteredRecords.length > 0 && (
          <div className="py-3.5 px-4 border-t border-brand-border bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-brand-text-secondary">
              Page <strong className="text-brand-text-primary">{currentPage}</strong> of{' '}
              <strong className="text-brand-text-primary">{totalPages}</strong> (
              {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, filteredRecords.length)} of {filteredRecords.length} records)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary font-semibold hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                  let pageNum = idx + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 3 + idx;
                    if (pageNum > totalPages) pageNum = totalPages - (4 - idx);
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded-lg font-mono font-semibold transition-colors ${
                        currentPage === pageNum
                          ? 'bg-brand-primary text-white'
                          : 'text-brand-text-secondary hover:bg-brand-bg'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-brand-border bg-white dark:bg-brand-surface text-brand-text-primary font-semibold hover:bg-brand-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
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
                className="p-1 rounded-lg hover:bg-brand-bg text-brand-text-secondary"
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

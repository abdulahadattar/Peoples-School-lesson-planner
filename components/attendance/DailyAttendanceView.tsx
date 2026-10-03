import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Save,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  Users,
  UserCheck,
  UserX,
  History,
  Info,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Clock,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ClassEnrollment,
  ClassAttendanceRow,
  DailyAttendanceRecord,
  SchoolAttendanceSummary,
  DEFAULT_GRADE_ENROLLMENTS,
  computeEnrollmentsFromRecords,
  buildAttendanceRows,
  calculateSchoolSummary,
  saveAttendanceRecord,
  loadAttendanceRecord,
  loadAttendanceDates,
  exportAttendanceCSV,
  cleanAttendanceInCharge,
  loadClassEnrollments,
} from '../../services/attendanceService';
import { printHtml } from '../../utils/printHelper';
import { fetchSheetData, StudentRecord, syncAttendanceToSheet } from '../../services/googleSheetsService';
import { queueSheetSync } from '../../services/sheetSyncQueue';
import { getAccessToken, getCurrentUser, initAuth } from '../../services/googleAuth';
import { isUserAdmin } from '../../services/adminService';
import { EnrollmentEditorModal } from './EnrollmentEditorModal';
import { AttendanceSummaryCards } from './AttendanceSummaryCards';
import { AttendanceTableRow } from './AttendanceTableRow';
import { AttendanceHistoryDrawer } from './AttendanceHistoryDrawer';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useSchoolConfig } from '../../hooks/useSchoolConfig';
import { User } from 'firebase/auth';
import { PhssjLogo } from '../Logo';

export const DailyAttendanceView: React.FC = () => {
  // Today's date in local YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const { config: schoolConfig, saveConfig } = useSchoolConfig();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(DEFAULT_GRADE_ENROLLMENTS);
  const [currentUser, setCurrentUser] = useState<User | null>(getCurrentUser());
  const [showEnrollmentModal, setShowEnrollmentModal] = useState<boolean>(false);
  const [inputs, setInputs] = useState<Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>>({});
  const [recordedBy, setRecordedBy] = useState<string>(schoolConfig?.classes?.[0]?.classTeacher || '');
  const [notes, setNotes] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncingEnrollment, setIsSyncingEnrollment] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  // Set when the selected date's record could not be read. It is a WARNING, not a
  // blocker: the register is left blank because of a failed read, and saving from
  // that blank state overwrites the date (or creates it). The teacher is asked to
  // confirm before that happens.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Once the teacher has acknowledged the blank-state warning for this date, stop
  // asking on every subsequent save.
  const [saveConfirmedOverBlank, setSaveConfirmedOverBlank] = useState<boolean>(false);

  const [historyList, setHistoryList] = useState<{ date: string; totalPresent: number; percentage: number }[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  const isAdmin = useMemo(() => isUserAdmin(currentUser?.email), [currentUser]);

  // Derive class teachers map from school config
  const classTeachersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (schoolConfig?.classes) {
      schoolConfig.classes.forEach((c) => {
        if (c.classTeacher) map[c.classKey] = c.classTeacher;
      });
    }
    return map;
  }, [schoolConfig?.classes]);

  // Derive manual enrollments from school config
  const manualEnrollments: ClassEnrollment[] = useMemo(() => {
    if (!schoolConfig?.classes?.length) return DEFAULT_GRADE_ENROLLMENTS;
    return schoolConfig.classes.map((c) => ({
      classKey: c.classKey,
      romanName: c.romanName,
      displayName: c.displayName,
      enrolledBoys: c.enrolledBoys,
      enrolledGirls: c.enrolledGirls,
      totalEnrollment: c.totalEnrollment || c.enrolledBoys + c.enrolledGirls,
    }));
  }, [schoolConfig?.classes]);

  // Auth listener for admin privileges
  useEffect(() => {
    const unsub = initAuth(
      (u) => setCurrentUser(u),
      () => setCurrentUser(null)
    );
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const refreshEnrollments = useCallback(
    async (force = false) => {
      if (schoolConfig?.enrollmentMode === 'manual' && !force) {
        setEnrollments(manualEnrollments);
        return;
      }
      setIsSyncingEnrollment(true);
      try {
        const token = await getAccessToken();
        const res = await fetchSheetData(undefined, undefined, token, force);
        if (res.records && res.records.length > 0) {
          const liveEnrollments = computeEnrollmentsFromRecords(res.records, manualEnrollments);
          setEnrollments(liveEnrollments);
          if (force) {
            showToast('Live enrollment sync complete!', 'success');
          }
        } else {
          setEnrollments(manualEnrollments);
        }
      } catch (err) {
        console.warn('Falling back to manual configured school enrollment:', err);
        setEnrollments(manualEnrollments);
      } finally {
        setIsSyncingEnrollment(false);
      }
    },
    [schoolConfig?.enrollmentMode, manualEnrollments]
  );

  // Sync enrollments when mode or classes change
  useEffect(() => {
    if (schoolConfig?.enrollmentMode === 'manual') {
      setEnrollments(manualEnrollments);
    } else {
      refreshEnrollments();
    }
  }, [schoolConfig?.enrollmentMode, manualEnrollments, refreshEnrollments]);

  // 2. Load attendance for the selected date
  const loadDateAttendance = useCallback(async (date: string) => {
    setIsLoading(true);
    setSaveSuccess(false);
    setSaveConfirmedOverBlank(false);
    try {
      const result = await loadAttendanceRecord(date);
      if (result.status === 'error') {
        // Do NOT silently present an unreadable date as an empty day. Leave the
        // register blank but flag it, so the teacher is told the figures on screen
        // are not what was previously recorded before they overwrite the date.
        setLoadError(result.error);
        return;
      }
      setLoadError(null);

      const record = result.record;
      if (record && record.classes && Object.keys(record.classes).length > 0) {
        const loadedInputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }> = {};
        Object.entries(record.classes).forEach(([key, val]) => {
          loadedInputs[key] = {
            presentBoys: typeof val.presentBoys === 'number' ? val.presentBoys : '',
            presentGirls: typeof val.presentGirls === 'number' ? val.presentGirls : '',
            classTeacher: val.classTeacher || '',
          };
        });
        setInputs(loadedInputs);
        setRecordedBy(cleanAttendanceInCharge(record.recordedBy));
        setNotes(record.notes || '');
        setLastSavedTime(record.updatedAt ? new Date(record.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null);
        setHasUnsavedChanges(false);
      } else {
        // Clear inputs for the new day so teacher has clean slate
        setInputs({});
        setNotes('');
        setLastSavedTime(null);
        setHasUnsavedChanges(false);
      }
    } catch (err: any) {
      setLoadError(`Could not load attendance for ${date}: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDateAttendance(selectedDate);
  }, [selectedDate, loadDateAttendance]);

  // Load history dates
  const refreshHistory = async () => {
    const list = await loadAttendanceDates();
    setHistoryList(list);
  };

  useEffect(() => {
    refreshHistory();
  }, [saveSuccess]);

  // Derived Rows & Summary
  const attendanceRows: ClassAttendanceRow[] = useMemo(() => {
    return buildAttendanceRows(enrollments, inputs, classTeachersMap);
  }, [enrollments, inputs, classTeachersMap]);

  const schoolSummary: SchoolAttendanceSummary = useMemo(() => {
    return calculateSchoolSummary(selectedDate, attendanceRows);
  }, [selectedDate, attendanceRows]);

  // Handle cell input change
  const handleInputChange = (
    classKey: string,
    field: 'presentBoys' | 'presentGirls',
    rawVal: string,
    maxVal: number
  ) => {
    setHasUnsavedChanges(true);
    setSaveSuccess(false);

    if (rawVal === '') {
      setInputs(prev => ({
        ...prev,
        [classKey]: {
          ...(prev[classKey] || { presentBoys: '', presentGirls: '' }),
          [field]: '',
        },
      }));
      return;
    }

    const num = parseInt(rawVal, 10);
    if (isNaN(num) || num < 0) return;

    // Cap gently or allow typing, but keep within bounds
    const safeVal = Math.min(num, maxVal);

    setInputs(prev => ({
      ...prev,
      [classKey]: {
        ...(prev[classKey] || { presentBoys: '', presentGirls: '' }),
        [field]: safeVal,
      },
    }));
  };



  // Quick helper: Clear current day's form
  const handleClearForm = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Clear Attendance Inputs',
      message: 'Are you sure you want to clear all attendance inputs for this day?',
      variant: 'danger',
      confirmLabel: 'Clear Form',
      onConfirm: () => {
        setInputs({});
        setHasUnsavedChanges(true);
        setConfirmDialog(null);
        showToast('Form cleared.', 'info');
      },
    });
  };

  // Save Attendance to Server & Local DB
  const handleSave = async () => {
    if (loadError && !saveConfirmedOverBlank) {
      setConfirmDialog({
        isOpen: true,
        title: 'Save Over Incomplete Data Warning',
        message: `${loadError}\n\nThe register is blank because of this, not because nothing was recorded. Saving now will overwrite any existing record for ${selectedDate} with the figures entered here.`,
        variant: 'warning',
        confirmLabel: 'Save Anyway',
        onConfirm: () => {
          setSaveConfirmedOverBlank(true);
          setConfirmDialog(null);
          executeSave();
        },
      });
      return;
    }
    await executeSave();
  };

  const executeSave = async () => {
    setIsSaving(true);
    try {
      const classesData: Record<string, { presentBoys: number; presentGirls: number; classTeacher?: string }> = {};
      attendanceRows.forEach(row => {
        classesData[row.classKey] = {
          presentBoys: typeof row.presentBoys === 'number' ? row.presentBoys : 0,
          presentGirls: typeof row.presentGirls === 'number' ? row.presentGirls : 0,
          classTeacher: row.classTeacher || '',
        };
      });

      const inChargeName = cleanAttendanceInCharge(recordedBy);
      const record: DailyAttendanceRecord = {
        date: selectedDate,
        recordedBy: inChargeName,
        notes,
        updatedAt: Date.now(),
        classes: classesData,
      };

      await saveAttendanceRecord(record);

      // The sheet result is reported separately. Firestore (and the local cache)
      // is the source of truth, so a sheet failure must not fail the save, but it
      // must NOT be reported as a success either - previously every failure was
      // swallowed and the user saw "saved successfully" while nothing reached
      // the sheet.
      let sheetMessage = '';
      try {
        const token = await getAccessToken();
        const result = await syncAttendanceToSheet({
          date: selectedDate,
          recordedBy: inChargeName,
          notes,
          summary: {
            totalEnrolled: schoolSummary.totalEnrolled,
            totalPresent: schoolSummary.totalPresent,
            totalAbsent: schoolSummary.totalAbsent,
            overallPercentage: schoolSummary.overallPercentage,
          },
          rows: attendanceRows,
        }, token);
        sheetMessage = result.message;
      } catch (syncErr: any) {
        console.error('Attendance Google Sheet sync failed:', syncErr);
        sheetMessage = syncErr?.message || 'Unknown sheet sync error';
        // The app save already succeeded and Firestore holds the record, so a
        // sheet failure must not lose the work. Queue the date and tell the
        // teacher the sheet is behind rather than leaving them to re-enter it.
        queueSheetSync({
          target: 'attendance',
          scope: selectedDate,
          label: `Attendance for ${selectedDate}`,
          payload: {
            date: selectedDate,
            recordedBy: inChargeName,
            notes,
            summary: {
              totalEnrolled: schoolSummary.totalEnrolled,
              totalPresent: schoolSummary.totalPresent,
              totalAbsent: schoolSummary.totalAbsent,
              overallPercentage: schoolSummary.overallPercentage,
            },
            rows: attendanceRows,
          },
        });
      }

      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (sheetMessage) {
        const sheetOk = sheetMessage.startsWith('Attendance synced');
        showToast(
          sheetOk
            ? `Daily attendance for ${selectedDate} saved to the app. Google Sheet: ${sheetMessage}`
            : `Daily attendance for ${selectedDate} is saved in the app, but the Google Sheet has not caught up yet (${sheetMessage}). ` +
              `Reconnect Google in the header, then press Sync to push it. Nothing is lost - the record is safe.`,
          sheetOk ? 'success' : 'info'
        );
      } else {
        showToast(`Daily attendance for ${selectedDate} saved successfully!`, 'success');
      }
      refreshHistory();
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Error saving attendance. Please check network connection.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Date Navigation
  const changeDateBy = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    const nextY = dateObj.getFullYear();
    const nextM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const nextD = String(dateObj.getDate()).padStart(2, '0');
    setSelectedDate(`${nextY}-${nextM}-${nextD}`);
  };

  // Print Daily Attendance Slip
  const handlePrint = () => {
    const formattedDate = new Date(selectedDate).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const inChargeName = cleanAttendanceInCharge(recordedBy);

    const rowsHtml = attendanceRows
      .map(
        r => `
      <tr>
        <td>
          <strong>${r.displayName}</strong>
          ${r.classTeacher ? `<div style="font-size:9.5px; color:#475569; font-weight:normal; margin-top:1px;">Teacher: ${r.classTeacher}</div>` : ''}
        </td>
        <td style="text-align:center;">${r.enrolledBoys}</td>
        <td style="text-align:center;">${r.enrolledGirls}</td>
        <td style="text-align:center; font-weight:600;">${r.totalEnrolled}</td>
        <td style="text-align:center; color:#0284c7; font-weight:600;">${typeof r.presentBoys === 'number' ? r.presentBoys : 0}</td>
        <td style="text-align:center; color:#0284c7; font-weight:600;">${typeof r.presentGirls === 'number' ? r.presentGirls : 0}</td>
        <td style="text-align:center; font-weight:bold; background:#f0fdf4;">${r.totalPresent}</td>
        <td style="text-align:center; color:#dc2626;">${r.absentTotal}</td>
        <td style="text-align:center; font-weight:bold; ${r.percentage >= 90 ? 'color:#16a34a;' : r.percentage >= 80 ? 'color:#0284c7;' : 'color:#d97706;'}">${r.percentage}%</td>
      </tr>
    `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Daily Attendance Slip - ${selectedDate}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111; font-size: 11px; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
          h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px; }
          h2 { margin: 4px 0 0 0; font-size: 13px; font-weight: 600; color: #334155; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
          th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; }
          .total-row td { background: #f8fafc; font-weight: bold; border-top: 2px solid #0f172a; }
          .kpi-cards { display: flex; gap: 10px; margin-bottom: 14px; }
          .kpi { flex: 1; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px; text-align: center; background: #fafafa; }
          .kpi .num { font-size: 16px; font-weight: bold; margin-top: 2px; }
          .signatures { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 12px; }
          .sign-col { text-align: center; width: 180px; border-top: 1px solid #475569; padding-top: 4px; font-size: 11px; font-weight: 600; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Peoples Higher Secondary School Jamshoro</h1>
          <h2>Daily Student Attendance Register (ECCE to Grade 12)</h2>
        </div>

        <div class="meta">
          <div><strong>Date:</strong> ${formattedDate} (${selectedDate})</div>
          <div><strong>Active Enrollment:</strong> ${schoolSummary.totalEnrolled} Students</div>
          <div><strong>Attendance In-Charge:</strong> ${inChargeName}</div>
        </div>

        <div class="kpi-cards">
          <div class="kpi">
            <div>Overall Attendance</div>
            <div class="num" style="color: #16a34a;">${schoolSummary.overallPercentage}%</div>
          </div>
          <div class="kpi">
            <div>Total Present</div>
            <div class="num" style="color: #0f172a;">${schoolSummary.totalPresent} / ${schoolSummary.totalEnrolled}</div>
          </div>
          <div class="kpi">
            <div>Boys Present</div>
            <div class="num" style="color: #0284c7;">${schoolSummary.presentBoys} / ${schoolSummary.enrolledBoys} (${schoolSummary.boysPercentage}%)</div>
          </div>
          <div class="kpi">
            <div>Girls Present</div>
            <div class="num" style="color: #ec4899;">${schoolSummary.presentGirls} / ${schoolSummary.enrolledGirls} (${schoolSummary.girlsPercentage}%)</div>
          </div>
          <div class="kpi">
            <div>Total Absent</div>
            <div class="num" style="color: #dc2626;">${schoolSummary.totalAbsent}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Grade / Class</th>
              <th style="text-align:center;">Enr. Boys</th>
              <th style="text-align:center;">Enr. Girls</th>
              <th style="text-align:center;">Total Enr.</th>
              <th style="text-align:center;">Pres. Boys</th>
              <th style="text-align:center;">Pres. Girls</th>
              <th style="text-align:center;">Total Pres.</th>
              <th style="text-align:center;">Total Abs.</th>
              <th style="text-align:center;">Att. %</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td><strong>TOTAL ATTENDANCE</strong></td>
              <td style="text-align:center;">${schoolSummary.enrolledBoys}</td>
              <td style="text-align:center;">${schoolSummary.enrolledGirls}</td>
              <td style="text-align:center;">${schoolSummary.totalEnrolled}</td>
              <td style="text-align:center; color:#0284c7;">${schoolSummary.presentBoys}</td>
              <td style="text-align:center; color:#0284c7;">${schoolSummary.presentGirls}</td>
              <td style="text-align:center; color:#16a34a; font-size:12px;">${schoolSummary.totalPresent}</td>
              <td style="text-align:center; color:#dc2626;">${schoolSummary.totalAbsent}</td>
              <td style="text-align:center; color:#16a34a; font-size:12px;">${schoolSummary.overallPercentage}%</td>
            </tr>
          </tbody>
        </table>

        ${notes ? `<p style="font-size:11px; margin-top:8px;"><strong>Remarks / Notes:</strong> ${notes}</p>` : ''}

        <div class="signatures">
          <div class="sign-col">
            Attendance In-Charge
            <div style="font-size:10px; font-weight:normal; color:#475569; margin-top:2px;">(${inChargeName})</div>
          </div>
          <div class="sign-col">Vice Principal</div>
          <div class="sign-col">Principal / Headmaster</div>
        </div>
      </body>
      </html>
    `;

    printHtml(html);
  };

  // Color helper for attendance percentage
  const getProgressColor = (pct: number) => {
    if (pct >= 90) return 'bg-emerald-500';
    if (pct >= 80) return 'bg-blue-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getTextColor = (pct: number) => {
    if (pct >= 90) return 'text-emerald-700 dark:text-emerald-400';
    if (pct >= 80) return 'text-blue-700 dark:text-blue-400';
    if (pct >= 70) return 'text-amber-700 dark:text-amber-400';
    return 'text-rose-700 dark:text-rose-400';
  };

  const getBadgeBg = (pct: number) => {
    if (pct >= 90) return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800';
    if (pct >= 80) return 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800';
    if (pct >= 70) return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800';
    return 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800';
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 animate-fadeInUp">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-[130] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
            notification.type === 'success'
              ? 'bg-emerald-900/90 text-white border-emerald-700'
              : notification.type === 'error'
              ? 'bg-rose-900/90 text-white border-rose-700'
              : 'bg-brand-surface text-brand-text-primary border-brand-border'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : (
            <Info className="w-4 h-4 text-brand-primary" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="glass-card rounded-2xl p-5 border border-brand-border shadow-soft flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shadow-xs shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-brand-text-primary tracking-tight">
                Daily Student Attendance
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                ECCE to Grade 12
              </span>
            </div>
            <p className="text-xs text-brand-text-secondary mt-0.5 flex items-center gap-2">
              Enter Boys and Girls present for each grade. Formulas auto-sum totals, percentages, and progress bars.
              <button
                onClick={() => refreshEnrollments(true)}
                disabled={isSyncingEnrollment}
                className="inline-flex items-center gap-1 min-h-[36px] px-2 -mx-2 rounded-lg hover:bg-brand-bg active:bg-brand-primary/15 hover:text-brand-primary transition-colors disabled:opacity-50"
                title="Force refresh live enrollments from Google Sheets"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingEnrollment ? 'animate-spin' : ''}`} />
                {isSyncingEnrollment ? 'Syncing...' : 'Sync Enrollments'}
              </button>
            </p>
          </div>
        </div>

        {/* Date Selector & Navigation Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Day Navigation. The arrows are 28px in the markup, which is below a
              comfortable thumb target, so they carry a 44px hit area on touch. */}
          <div className="inline-flex items-center bg-brand-surface rounded-xl border border-brand-border p-1 shadow-xs">
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              title="Previous Day"
              aria-label="Previous Day"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg active:bg-brand-primary/15 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-2.5">
              <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-semibold text-brand-text-primary bg-transparent focus:outline-none cursor-pointer min-h-[40px]"
              />
            </div>

            <button
              type="button"
              onClick={() => changeDateBy(1)}
              title="Next Day"
              aria-label="Next Day"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg active:bg-brand-primary/15 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate(getTodayStr())}
            className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
              selectedDate === getTodayStr()
                ? 'bg-brand-primary text-white border-brand-primary shadow-xs'
                : 'bg-brand-surface text-brand-text-secondary border-brand-border hover:text-brand-text-primary hover:bg-brand-bg'
            }`}
          >
            Today
          </button>

          <button
            type="button"
            onClick={() => setShowHistoryDrawer(prev => !prev)}
            title="View Past Attendance History"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-brand-surface text-brand-text-primary border border-brand-border hover:bg-brand-bg transition-colors shadow-xs"
          >
            <History className="w-3.5 h-3.5 text-brand-text-secondary" />
            <span>Archive</span>
          </button>
        </div>
      </div>

      {/* Whole School KPI & Overall Attendance Bar */}
      <AttendanceSummaryCards
        schoolSummary={schoolSummary}
        selectedDate={selectedDate}
        schoolConfig={schoolConfig}
        isAdmin={isAdmin}
        isSyncingEnrollment={isSyncingEnrollment}
        onOpenEnrollments={() => setShowEnrollmentModal(true)}
        onSaveConfig={saveConfig}
        showToast={showToast}
      />

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface p-3.5 rounded-2xl border border-brand-border shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Class Enrollments Admin / View */}
          <button
            type="button"
            id="action-toolbar-enrollments-btn"
            onClick={() => setShowEnrollmentModal(true)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-all shadow-xs ${
              isAdmin
                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-brand-bg hover:bg-brand-border text-brand-text-primary border-brand-border'
            }`}
            title="Configure official school enrollments"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isAdmin ? 'text-blue-600' : 'text-brand-text-secondary'}`} />
            <span>Class Enrollments {isAdmin ? '(Admin)' : ''}</span>
          </button>

          {/* Clear Form */}
          <button
            type="button"
            onClick={handleClearForm}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-brand-text-secondary hover:text-rose-600 border border-brand-border transition-colors shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status indication */}
          {hasUnsavedChanges ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium mr-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Unsaved changes
            </span>
          ) : lastSavedTime ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium mr-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved ({lastSavedTime})
            </span>
          ) : null}

          {/* Print Slip */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs"
          >
            <Printer className="w-3.5 h-3.5 text-brand-text-secondary" />
            <span>Print Official Slip</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => exportAttendanceCSV(selectedDate, attendanceRows, schoolSummary)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text-primary border border-brand-border transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-brand-text-secondary" />
            <span>Export CSV</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            title={loadError ? 'The register below is blank because loading failed - saving will overwrite this date' : undefined}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl brand-gradient text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-md active:scale-95"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Attendance'}</span>
          </button>
        </div>
      </div>

      {/* Load failure: the register below is blank because the read failed, not
          because the day was never marked. Saving is still allowed - it overwrites
          the date, or creates it if none exists - but the teacher is warned. */}
      {loadError && (
        <div
          role="alert"
          className="flex items-start gap-3.5 p-4 sm:p-5 rounded-2xl border border-amber-300/80 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 shadow-soft backdrop-blur-xs transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 border border-amber-300/60 dark:border-amber-700/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 shadow-xs">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 uppercase tracking-wider">
                Offline Mode
              </span>
              <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                Working offline — {selectedDate} was not loaded from the server
              </p>
            </div>
            <p className="text-xs mt-2 leading-relaxed text-amber-900/90 dark:text-amber-200/90 font-medium">
              {loadError}
            </p>
            <p className="text-xs mt-2 leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              The register below is blank because of this, not because nothing was recorded. You can
              still save: this will overwrite {selectedDate} if a record already exists, or create it if
              it does not. Figures are stored on this device and sync to the server when it is reachable.
            </p>
            <div className="mt-3.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => loadDateAttendance(selectedDate)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Retrying...' : `Retry loading ${selectedDate}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grade-by-Grade Attendance Table */}
      <div className="glass-card rounded-2xl border border-brand-border shadow-soft overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-brand-text-primary">
              All Grades Roster (ECCE to Grade 12)
            </h3>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              Separate input cells for Boys and Girls. Formulas calculate total present, absentees, and percentages automatically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-text-secondary font-medium">Attendance In-Charge:</span>
            <input
              type="text"
              value={recordedBy}
              onChange={e => {
                setRecordedBy(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="e.g. Miss Shahida"
              className="h-8 px-2.5 text-xs rounded-lg bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[840px]">
            <thead>
              <tr className="bg-brand-bg/80 border-b border-brand-border text-brand-text-secondary font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 min-w-[140px]">Grade / Class</th>
                <th className="py-3 px-3 text-center min-w-[90px]">Enrolled</th>
                <th className="py-3 px-3 text-center min-w-[110px] bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300">
                  Present Boys
                </th>
                <th className="py-3 px-3 text-center min-w-[110px] bg-pink-50/40 dark:bg-pink-950/20 text-pink-700 dark:text-pink-300">
                  Present Girls
                </th>
                <th className="py-3 px-3 text-center min-w-[100px]">Total Present</th>
                <th className="py-3 px-3 text-center min-w-[80px]">Absent</th>
                <th className="py-3 px-3 text-center min-w-[80px]">Att. %</th>
                <th className="py-3 px-4 min-w-[180px]">Attendance Bar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/60">
              {attendanceRows.map((row, index) => (
                <AttendanceTableRow
                  key={row.classKey}
                  row={row}
                  index={index}
                  onInputChange={handleInputChange}
                />
              ))}
            </tbody>

            {/* Total Attendance Row */}
            <tfoot>
              <tr className="bg-brand-bg/90 border-t-2 border-brand-border font-bold text-brand-text-primary text-xs">
                <td className="py-4 px-4 font-black">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                    <span>TOTAL ATTENDANCE</span>
                  </div>
                </td>
                <td className="py-4 px-3 text-center font-extrabold text-sm">
                  {schoolSummary.totalEnrolled}
                </td>
                <td className="py-4 px-3 text-center text-blue-700 dark:text-blue-300 font-extrabold text-sm bg-blue-50/40 dark:bg-blue-950/20">
                  {schoolSummary.presentBoys}
                </td>
                <td className="py-4 px-3 text-center text-pink-700 dark:text-pink-300 font-extrabold text-sm bg-pink-50/40 dark:bg-pink-950/20">
                  {schoolSummary.presentGirls}
                </td>
                <td className="py-4 px-3 text-center">
                  <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-sm shadow-xs">
                    {schoolSummary.totalPresent}
                  </span>
                </td>
                <td className="py-4 px-3 text-center text-rose-600 font-extrabold text-sm">
                  {schoolSummary.totalAbsent}
                </td>
                <td className="py-4 px-3 text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg font-black text-xs border ${getBadgeBg(
                      schoolSummary.overallPercentage
                    )} ${getTextColor(schoolSummary.overallPercentage)}`}
                  >
                    {schoolSummary.overallPercentage}%
                  </span>
                </td>
                <td className="py-4 px-4">
                  <div className="w-full h-3.5 bg-brand-bg rounded-full overflow-hidden p-0.5 border border-brand-border">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getProgressColor(
                        schoolSummary.overallPercentage
                      )}`}
                      style={{ width: `${schoolSummary.overallPercentage}%` }}
                    />
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Bottom Notes Bar */}
        <div className="p-4 bg-brand-surface border-t border-brand-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1 w-full sm:w-auto">
            <input
              type="text"
              value={notes}
              onChange={e => {
                setNotes(e.target.value);
                setHasUnsavedChanges(true);
              }}
              placeholder="Optional remarks or notes for today's attendance (e.g. Rainy weather, Sports day)..."
              className="w-full h-9 px-3 text-xs rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              title={loadError ? 'The register below is blank because loading failed - saving will overwrite this date' : undefined}
              className="px-4 py-2 text-xs font-bold rounded-xl brand-gradient text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm active:scale-95"
            >
              {isSaving ? 'Saving...' : 'Save Roster'}
            </button>
          </div>
        </div>
      </div>

      {/* History / Archive Drawer Modal */}
      <AttendanceHistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        historyList={historyList}
        selectedDate={selectedDate}
        totalEnrolled={schoolSummary.totalEnrolled}
        onSelectDate={setSelectedDate}
      />

      {/* Admin Enrollment Editor Modal */}
      <EnrollmentEditorModal
        isOpen={showEnrollmentModal}
        onClose={() => setShowEnrollmentModal(false)}
        currentEnrollments={enrollments}
        onSave={(updated) => {
          setEnrollments(updated);
          showToast('Official class enrollments successfully updated and saved!', 'success');
        }}
        currentUser={currentUser}
      />

      {/* Dynamic Action Confirm Modal */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant || 'danger'}
          confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
};

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
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Clock,
  ShieldCheck,
  RefreshCw,
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
} from '../../services/attendanceService';
import { fetchSheetData, StudentRecord, syncAttendanceToSheet } from '../../services/googleSheetsService';
import { getAccessToken } from '../../services/googleAuth';
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

  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(DEFAULT_GRADE_ENROLLMENTS);
  const [inputs, setInputs] = useState<Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>>({});
  const [recordedBy, setRecordedBy] = useState<string>('Miss Shahida');
  const [notes, setNotes] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSyncingEnrollment, setIsSyncingEnrollment] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const [historyList, setHistoryList] = useState<{ date: string; totalPresent: number; percentage: number }[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const refreshEnrollments = useCallback(async (force = false) => {
    setIsSyncingEnrollment(true);
    try {
      const token = await getAccessToken();
      const res = await fetchSheetData(undefined, undefined, token, force);
      if (res.records && res.records.length > 0) {
        const liveEnrollments = computeEnrollmentsFromRecords(res.records);
        setEnrollments(liveEnrollments);
        if (force) {
          showToast('Live enrollment sync complete!', 'success');
        }
      }
    } catch (err) {
      console.warn('Falling back to default verified school enrollment:', err);
    } finally {
      setIsSyncingEnrollment(false);
    }
  }, []);

  // 1. Load live active enrollment from Google Sheets student records
  useEffect(() => {
    refreshEnrollments();
  }, [refreshEnrollments]);

  // 2. Load attendance for the selected date
  const loadDateAttendance = useCallback(async (date: string) => {
    setIsLoading(true);
    setSaveSuccess(false);
    try {
      const record = await loadAttendanceRecord(date);
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
    } catch (err) {
      console.error('Failed to load attendance:', err);
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
    return buildAttendanceRows(enrollments, inputs);
  }, [enrollments, inputs]);

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
    if (window.confirm('Are you sure you want to clear all attendance inputs for this day?')) {
      setInputs({});
      setHasUnsavedChanges(true);
      showToast('Form cleared.', 'info');
    }
  };

  // Save Attendance to Server & Local DB
  const handleSave = async () => {
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

      try {
        const token = await getAccessToken();
        await syncAttendanceToSheet({
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
      } catch (syncErr) {
        console.warn('Google Sheet attendance sync note:', syncErr);
      }
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      showToast(`Daily attendance for ${selectedDate} saved successfully!`, 'success');
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate the official attendance slip.');
      return;
    }

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

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
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
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
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
            <Sparkles className="w-4 h-4 text-brand-primary" />
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
                className="inline-flex items-center gap-1 hover:text-brand-primary transition-colors disabled:opacity-50"
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
          {/* Day Navigation */}
          <div className="inline-flex items-center bg-brand-surface rounded-xl border border-brand-border p-1 shadow-xs">
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              title="Previous Day"
              className="p-1.5 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-2.5">
              <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-semibold text-brand-text-primary bg-transparent focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => changeDateBy(1)}
              title="Next Day"
              className="p-1.5 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg transition-colors"
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
      <div className="glass-card rounded-2xl p-5 border border-brand-border shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-brand-text-primary">
              Total Attendance Overview
            </h3>
            <span className="text-xs text-brand-text-secondary">
              ({new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })})
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-brand-text-secondary">
            <span>
              Active Roster: <strong className="text-brand-text-primary">{schoolSummary.totalEnrolled}</strong>
            </span>
            {isSyncingEnrollment && (
              <span className="inline-flex items-center gap-1 text-[10px] text-brand-primary">
                <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
              </span>
            )}
          </div>
        </div>

        {/* Big Proportional Whole School Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-brand-text-primary tracking-tight">
                {schoolSummary.overallPercentage}%
              </span>
              <span className="text-xs sm:text-sm font-semibold text-brand-text-secondary">
                Total Attendance
              </span>
            </div>

            <div className="text-right">
              <span className="text-base sm:text-lg font-bold text-brand-text-primary">
                {schoolSummary.totalPresent}{' '}
                <span className="text-xs font-normal text-brand-text-secondary">/ {schoolSummary.totalEnrolled} Present</span>
              </span>
            </div>
          </div>

          {/* Proportional Bar */}
          <div className="w-full h-4 sm:h-5 bg-brand-bg rounded-full overflow-hidden p-0.5 border border-brand-border">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProgressColor(schoolSummary.overallPercentage)}`}
              style={{ width: `${Math.min(100, schoolSummary.overallPercentage)}%` }}
            />
          </div>
        </div>

        {/* 4 Key Metric Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Total Present */}
          <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
            <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
              <span>Total Present</span>
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-lg font-bold text-brand-text-primary">
              {schoolSummary.totalPresent}
            </div>
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
              {schoolSummary.overallPercentage}% of school
            </div>
          </div>

          {/* Boys Present */}
          <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
            <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
              <span>Boys Present</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                Boys
              </span>
            </div>
            <div className="text-lg font-bold text-brand-text-primary">
              {schoolSummary.presentBoys}{' '}
              <span className="text-xs text-brand-text-secondary font-normal">/ {schoolSummary.enrolledBoys}</span>
            </div>
            <div className="text-[11px] text-blue-700 dark:text-blue-400 font-medium mt-0.5">
              {schoolSummary.boysPercentage}% boys attendance
            </div>
          </div>

          {/* Girls Present */}
          <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
            <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
              <span>Girls Present</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300">
                Girls
              </span>
            </div>
            <div className="text-lg font-bold text-brand-text-primary">
              {schoolSummary.presentGirls}{' '}
              <span className="text-xs text-brand-text-secondary font-normal">/ {schoolSummary.enrolledGirls}</span>
            </div>
            <div className="text-[11px] text-pink-700 dark:text-pink-400 font-medium mt-0.5">
              {schoolSummary.girlsPercentage}% girls attendance
            </div>
          </div>

          {/* Total Absent */}
          <div className="bg-brand-surface/80 rounded-xl p-3 border border-brand-border">
            <div className="flex items-center justify-between text-xs text-brand-text-secondary mb-1">
              <span>Total Absent</span>
              <UserX className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-lg font-bold text-rose-600">
              {schoolSummary.totalAbsent}
            </div>
            <div className="text-[11px] text-brand-text-secondary mt-0.5">
              B: {schoolSummary.absentBoys} | G: {schoolSummary.absentGirls}
            </div>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface p-3.5 rounded-2xl border border-brand-border shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
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
              placeholder="Miss Shahida"
              className="h-8 px-2.5 text-xs rounded-lg bg-brand-bg border border-brand-border text-brand-text-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
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
              {attendanceRows.map((row, index) => {
                const isGrade9 = row.classKey === 'IX';

                return (
                  <tr
                    key={row.classKey}
                    className={`hover:bg-brand-surface/70 transition-colors ${
                      isGrade9 ? 'bg-brand-primary/5' : index % 2 === 1 ? 'bg-brand-bg/30' : ''
                    }`}
                  >
                    {/* Grade Name */}
                    <td className="py-3 px-4 font-semibold text-brand-text-primary">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {row.romanName}
                          </span>
                          <div>
                            <div className="font-bold text-xs">{row.displayName}</div>
                            {row.classTeacher && (
                              <div className="text-[10px] text-brand-text-secondary mt-0.5">
                                Teacher: {row.classTeacher}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Enrolled */}
                    <td className="py-3 px-3 text-center">
                      <div className="font-bold text-sm text-brand-text-primary">
                        {row.totalEnrolled}
                      </div>
                      <div className="text-[10px] text-brand-text-secondary">
                        B: {row.enrolledBoys} | G: {row.enrolledGirls}
                      </div>
                    </td>

                    {/* Present Boys Input */}
                    <td className="py-2.5 px-3 text-center bg-blue-50/20 dark:bg-blue-950/10">
                      <div className="flex items-center justify-center">
                        <div className="relative w-20">
                          <input
                            type="number"
                            min="0"
                            max={row.enrolledBoys}
                            placeholder="0"
                            value={row.presentBoys}
                            onChange={e =>
                              handleInputChange(row.classKey, 'presentBoys', e.target.value, row.enrolledBoys)
                            }
                            className={`w-full h-9 text-center font-bold text-sm rounded-xl border bg-brand-bg text-brand-text-primary focus:outline-none focus:ring-2 transition-all ${
                              typeof row.presentBoys === 'number' && row.presentBoys > row.enrolledBoys
                                ? 'border-rose-500 focus:ring-rose-200'
                                : 'border-brand-border focus:border-blue-500 focus:ring-blue-100 dark:focus:ring-blue-950'
                            }`}
                          />
                          <span className="absolute right-2 top-2.5 text-[10px] text-brand-text-secondary/60 pointer-events-none">
                            /{row.enrolledBoys}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Present Girls Input */}
                    <td className="py-2.5 px-3 text-center bg-pink-50/20 dark:bg-pink-950/10">
                      <div className="flex items-center justify-center">
                        <div className="relative w-20">
                          <input
                            type="number"
                            min="0"
                            max={row.enrolledGirls}
                            placeholder="0"
                            value={row.presentGirls}
                            onChange={e =>
                              handleInputChange(row.classKey, 'presentGirls', e.target.value, row.enrolledGirls)
                            }
                            className={`w-full h-9 text-center font-bold text-sm rounded-xl border bg-brand-bg text-brand-text-primary focus:outline-none focus:ring-2 transition-all ${
                              typeof row.presentGirls === 'number' && row.presentGirls > row.enrolledGirls
                                ? 'border-rose-500 focus:ring-rose-200'
                                : 'border-brand-border focus:border-pink-500 focus:ring-pink-100 dark:focus:ring-pink-950'
                            }`}
                          />
                          <span className="absolute right-2 top-2.5 text-[10px] text-brand-text-secondary/60 pointer-events-none">
                            /{row.enrolledGirls}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Total Present (Formula Sum) */}
                    <td className="py-3 px-3 text-center font-bold">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800">
                        {row.totalPresent}
                      </span>
                    </td>

                    {/* Absent Count */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`font-semibold ${
                          row.absentTotal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
                        }`}
                      >
                        {row.absentTotal}
                      </span>
                      {row.absentTotal > 0 && (
                        <div className="text-[10px] text-brand-text-secondary">
                          B:{row.absentBoys} G:{row.absentGirls}
                        </div>
                      )}
                    </td>

                    {/* Percentage */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs border ${getBadgeBg(
                          row.percentage
                        )} ${getTextColor(row.percentage)}`}
                      >
                        {row.percentage}%
                      </span>
                    </td>

                    {/* Proportional Percentage Bar */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <div className="w-full h-3 bg-brand-bg rounded-full overflow-hidden p-0.5 border border-brand-border">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${getProgressColor(
                              row.percentage
                            )}`}
                            style={{ width: `${row.percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-brand-text-secondary font-medium">
                          <span>B: {row.boysPercentage}%</span>
                          <span>G: {row.girlsPercentage}%</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
              className="px-4 py-2 text-xs font-bold rounded-xl brand-gradient text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm active:scale-95"
            >
              {isSaving ? 'Saving...' : 'Save Roster'}
            </button>
          </div>
        </div>
      </div>

      {/* History / Archive Drawer Modal */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-lg w-full overflow-hidden animate-scaleUp">
            <div className="p-5 border-b border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-brand-primary" />
                <h3 className="text-base font-bold text-brand-text-primary">
                  Attendance Records Archive
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="w-8 h-8 rounded-lg hover:bg-brand-bg flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto space-y-2">
              {historyList.length === 0 ? (
                <div className="text-center py-8 text-xs text-brand-text-secondary">
                  No previous dates recorded yet. Click &quot;Save Attendance&quot; to archive today&apos;s records.
                </div>
              ) : (
                historyList.map(item => (
                  <div
                    key={item.date}
                    onClick={() => {
                      setSelectedDate(item.date);
                      setShowHistoryDrawer(false);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      item.date === selectedDate
                        ? 'bg-brand-primary/10 border-brand-primary text-brand-primary font-bold'
                        : 'bg-brand-bg hover:bg-brand-border/40 border-brand-border text-brand-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-brand-text-secondary" />
                      <div>
                        <div className="text-xs font-bold">{item.date}</div>
                        <div className="text-[10px] text-brand-text-secondary">
                          {new Date(item.date).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold">
                        {item.totalPresent} / 866
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${getBadgeBg(
                          item.percentage
                        )} ${getTextColor(item.percentage)}`}
                      >
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-brand-bg border-t border-brand-border flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-brand-surface border border-brand-border text-brand-text-primary hover:bg-brand-bg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  Save,
  RotateCcw,
  Users,
  CheckCircle2,
  AlertCircle,
  LogIn,
} from 'lucide-react';
import {
  ClassEnrollment,
  DEFAULT_GRADE_ENROLLMENTS,
  saveClassEnrollments,
} from '../../services/attendanceService';
import { isUserAdmin } from '../../services/adminService';
import { googleSignIn, getCurrentUser } from '../../services/googleAuth';
import { User } from 'firebase/auth';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { BaseModal } from '../ui/BaseModal';
import { AdminAccessBadge } from '../ui/AdminAccessBadge';

interface EnrollmentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEnrollments: ClassEnrollment[];
  onSave: (updated: ClassEnrollment[]) => void;
  currentUser: User | null;
}

export const EnrollmentEditorModal: React.FC<EnrollmentEditorModalProps> = ({
  isOpen,
  onClose,
  currentEnrollments,
  onSave,
  currentUser,
}) => {
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>(() =>
    JSON.parse(JSON.stringify(currentEnrollments.length > 0 ? currentEnrollments : DEFAULT_GRADE_ENROLLMENTS))
  );
  const [activeUser, setActiveUser] = useState<User | null>(currentUser || getCurrentUser());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Sync state when opened
  React.useEffect(() => {
    if (isOpen) {
      setEnrollments(
        JSON.parse(JSON.stringify(currentEnrollments.length > 0 ? currentEnrollments : DEFAULT_GRADE_ENROLLMENTS))
      );
      setActiveUser(currentUser || getCurrentUser());
      setSaveSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, currentEnrollments, currentUser]);

  const isAdmin = useMemo(() => isUserAdmin(activeUser?.email), [activeUser]);

  const totals = useMemo(() => {
    let totalEnrolled = 0;
    let totalBoys = 0;
    let totalGirls = 0;
    enrollments.forEach((e) => {
      const tot = typeof e.totalEnrollment === 'number' && e.totalEnrollment > 0
        ? e.totalEnrollment
        : (e.enrolledBoys + e.enrolledGirls);
      totalEnrolled += tot;
      totalBoys += e.enrolledBoys || 0;
      totalGirls += e.enrolledGirls || 0;
    });
    return { totalEnrolled, totalBoys, totalGirls };
  }, [enrollments]);

  const handleFieldChange = (
    index: number,
    field: 'totalEnrollment' | 'enrolledBoys' | 'enrolledGirls',
    value: string
  ) => {
    const num = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(num) || num < 0) return;

    setEnrollments((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: num,
      };
      return copy;
    });
    setSaveSuccess(false);
  };

  const handleResetToBaseline = () => {
    setShowResetConfirm(true);
  };

  const executeResetToBaseline = () => {
    setEnrollments(JSON.parse(JSON.stringify(DEFAULT_GRADE_ENROLLMENTS)));
    setShowResetConfirm(false);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setErrorMessage('Admin privileges required to modify school baseline enrollments.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);

      // Sanitize: ensure totalEnrollment equals sum of boys+girls if not explicitly set
      const sanitized: ClassEnrollment[] = enrollments.map((e) => ({
        ...e,
        enrolledBoys: Math.max(0, e.enrolledBoys || 0),
        enrolledGirls: Math.max(0, e.enrolledGirls || 0),
        totalEnrollment: (e.enrolledBoys || 0) + (e.enrolledGirls || 0),
      }));

      await saveClassEnrollments(sanitized, activeUser?.email || 'admin');
      onSave(sanitized);
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving enrollments:', err);
      setErrorMessage(err.message || 'Failed to save enrollments to Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignInAdmin = async () => {
    try {
      const user = await googleSignIn();
      setActiveUser(user);
    } catch (err: any) {
      setErrorMessage('Google Sign-In failed: ' + err.message);
    }
  };

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="4xl"
        title="Official School Enrollment Register"
        subtitle="Master grade & class enrollments for daily attendance and proxy rosters"
        icon={
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Users className="w-5 h-5" />
          </div>
        }
        contentClassName="p-0"
        footer={
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={!isAdmin || isSaving}
              onClick={handleResetToBaseline}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                isAdmin
                  ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 cursor-pointer'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400 bg-slate-50 dark:bg-slate-900 cursor-not-allowed'
              }`}
              title="Reset to official handwritten baseline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Baseline (868 Total)
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-enrollments-btn"
                disabled={!isAdmin || isSaving}
                onClick={handleSave}
                className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg shadow-xs transition-colors ${
                  isAdmin
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-98'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving to Cloud...' : 'Save Official Enrollments'}
              </button>
            </div>
          </div>
        }
      >
        {/* Admin Access Status Bar */}
        <div className="px-6 py-3 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <AdminAccessBadge
              isAdmin={isAdmin}
              adminLabel={`Admin Verified: ${activeUser?.email || ''}`}
              teacherLabel={
                activeUser
                  ? `Signed in as ${activeUser.email} (View-only: editing restricted to admin)`
                  : 'Read-only mode (Sign in with admin account to edit)'
              }
            />
          </div>

          {!isAdmin && (
            <button
              id="admin-login-modal-btn"
              type="button"
              onClick={handleSignInAdmin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-2xs transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in as Admin
            </button>
          )}
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Official enrollments successfully saved to cloud database and updated!</span>
          </div>
        )}

        {/* Scrollable Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/50 sticky top-0 z-10 backdrop-blur-xs">
                <th className="py-2.5 px-3">Class / Section</th>
                <th className="py-2.5 px-3 text-center">Total Enrolled</th>
                <th className="py-2.5 px-3 text-center">Boys</th>
                <th className="py-2.5 px-3 text-center">Girls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {enrollments.map((enr, idx) => (
                <tr key={enr.classKey} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                    <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold mr-2">
                      {enr.romanName}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">({enr.classKey})</span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      min="0"
                      disabled={!isAdmin}
                      value={enr.totalEnrollment ?? (enr.enrolledBoys + enr.enrolledGirls)}
                      onChange={(e) => handleFieldChange(idx, 'totalEnrollment', e.target.value)}
                      className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                        isAdmin
                          ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      min="0"
                      disabled={!isAdmin}
                      value={enr.enrolledBoys}
                      onChange={(e) => handleFieldChange(idx, 'enrolledBoys', e.target.value)}
                      className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                        isAdmin
                          ? 'bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-blue-900 dark:text-blue-300 shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      min="0"
                      disabled={!isAdmin}
                      value={enr.enrolledGirls}
                      onChange={(e) => handleFieldChange(idx, 'enrolledGirls', e.target.value)}
                      className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                        isAdmin
                          ? 'bg-white dark:bg-slate-900 border-pink-200 dark:border-pink-800 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 text-pink-900 dark:text-pink-300 shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800/60 border-transparent text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-white">
                <td className="py-3 px-3 uppercase text-xs tracking-wider">Total School Enrollment</td>
                <td className="py-3 px-3 text-center text-base text-blue-700 dark:text-blue-400 font-extrabold">
                  {totals.totalEnrolled}
                </td>
                <td className="py-3 px-3 text-center text-base text-blue-600 dark:text-blue-400 font-extrabold">
                  {totals.totalBoys}
                </td>
                <td className="py-3 px-3 text-center text-base text-pink-600 dark:text-pink-400 font-extrabold">
                  {totals.totalGirls}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </BaseModal>

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Reset All Class Enrollments?"
        message="Are you sure you want to reset all class enrollments to the official handwritten baseline register (868 Total, 365 Boys, 263 Girls)?"
        variant="warning"
        confirmLabel="Reset Enrollments"
        onConfirm={executeResetToBaseline}
        onClose={() => setShowResetConfirm(false)}
      />
    </>
  );
};

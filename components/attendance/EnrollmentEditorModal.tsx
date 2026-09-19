import React, { useState, useMemo } from 'react';
import {
  X,
  Save,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
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
import { isUserAdmin, ADMIN_EMAILS } from '../../services/adminService';
import { googleSignIn, getCurrentUser } from '../../services/googleAuth';
import { User } from 'firebase/auth';

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
    if (window.confirm('Reset all class enrollments to the official handwritten baseline register (868 Total, 365 Boys, 263 Girls)?')) {
      setEnrollments(JSON.parse(JSON.stringify(DEFAULT_GRADE_ENROLLMENTS)));
      setSaveSuccess(false);
    }
  };

  const handleSignInAdmin = async () => {
    try {
      const res = await googleSignIn();
      if (res?.user) {
        setActiveUser(res.user);
      }
    } catch (err: any) {
      setErrorMessage('Admin sign in error: ' + (err?.message || String(err)));
    }
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setErrorMessage(`Only designated administrator accounts (${ADMIN_EMAILS.join(', ')}) have permission to update class enrollments.`);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await saveClassEnrollments(enrollments, activeUser?.email || 'Admin');
      onSave(enrollments);
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error saving enrollments:', err);
      setErrorMessage(err?.message || 'Failed to save enrollments to cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="enrollment-editor-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Official School Enrollment Register
              </h2>
              <p className="text-xs text-slate-500">
                Master grade & class enrollments for daily attendance and proxy rosters
              </p>
            </div>
          </div>
          <button
            id="close-enrollment-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin Access Status Bar */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            {isAdmin ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Admin Verified: {activeUser?.email}
              </span>
            ) : activeUser ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-medium border border-amber-200">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                Signed in as {activeUser.email} (View-only: editing restricted to admin)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                Read-only mode (Sign in with admin account to edit)
              </span>
            )}
          </div>

          {!isAdmin && (
            <button
              id="admin-login-modal-btn"
              onClick={handleSignInAdmin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign in as Admin
            </button>
          )}
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Official enrollments successfully saved to cloud database and updated!</span>
          </div>
        )}

        {/* Scrollable Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/50 sticky top-0 z-10 backdrop-blur-xs">
                <th className="py-2.5 px-3">Class / Section</th>
                <th className="py-2.5 px-3 text-center">Total Enrolled</th>
                <th className="py-2.5 px-3 text-center">Boys</th>
                <th className="py-2.5 px-3 text-center">Girls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {enrollments.map((enr, idx) => (
                <tr key={enr.classKey} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2 px-3 font-medium text-slate-800">
                    <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold mr-2">
                      {enr.romanName}
                    </span>
                    <span className="text-xs text-slate-400">({enr.classKey})</span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      min="0"
                      disabled={!isAdmin}
                      value={enr.totalEnrollment ?? (enr.enrolledBoys + enr.enrolledGirls)}
                      onChange={(e) => handleFieldChange(idx, 'totalEnrollment', e.target.value)}
                      className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                        isAdmin
                          ? 'bg-white border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 shadow-xs'
                          : 'bg-slate-100 border-transparent text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      min="0"
                      disabled={!isAdmin}
                      value={enr.enrolledBoys}
                      onChange={(e) => handleFieldChange(idx, 'enrolledBoys', e.target.value)}
                      className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                        isAdmin
                          ? 'bg-white border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-blue-900 shadow-xs'
                          : 'bg-slate-100 border-transparent text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      min="0"
                      disabled={!isAdmin}
                      value={enr.enrolledGirls}
                      onChange={(e) => handleFieldChange(idx, 'enrolledGirls', e.target.value)}
                      className={`w-20 px-2.5 py-1.5 text-center text-sm font-semibold rounded-lg border transition-colors ${
                        isAdmin
                          ? 'bg-white border-pink-200 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 text-pink-900 shadow-xs'
                          : 'bg-slate-100 border-transparent text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                <td className="py-3 px-3 uppercase text-xs tracking-wider">Total School Enrollment</td>
                <td className="py-3 px-3 text-center text-base text-blue-700 font-extrabold">
                  {totals.totalEnrolled}
                </td>
                <td className="py-3 px-3 text-center text-base text-blue-600 font-extrabold">
                  {totals.totalBoys}
                </td>
                <td className="py-3 px-3 text-center text-base text-pink-600 font-extrabold">
                  {totals.totalGirls}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={!isAdmin || isSaving}
            onClick={handleResetToBaseline}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              isAdmin
                ? 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100'
                : 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
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
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              id="save-enrollments-btn"
              disabled={!isAdmin || isSaving}
              onClick={handleSave}
              className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors ${
                isAdmin
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-98'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving to Cloud...' : 'Save Official Enrollments'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

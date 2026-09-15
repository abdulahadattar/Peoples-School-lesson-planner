import React from 'react';
import {
  X,
  Edit2,
  Phone,
  Copy,
  Check,
  Calendar,
  User,
  GraduationCap,
  MapPin,
  Shield,
  Clock,
} from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { PhssjLogo } from '../Logo';

interface StudentDetailModalProps {
  isOpen: boolean;
  student: StudentRecord | null;
  onClose: () => void;
  onEdit: (student: StudentRecord) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  isOpen,
  student,
  onClose,
  onEdit,
}) => {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!isOpen || !student) return null;

  const copyToClipboard = (text: string, key: string) => {
    if (!text || text === 'NA' || text === 'N/A') return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getStatusBadgeClass = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('promot') || s.includes('active')) {
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    if (s.includes('new') || s.includes('enroll')) {
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800';
    }
    if (s.includes('drop') || s.includes('struck') || s.includes('left')) {
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card p-6 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-brand-border">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-900 shadow-soft border border-brand-border flex items-center justify-center p-1 ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0">
              <PhssjLogo className="w-full h-full rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary font-mono text-xs font-bold border border-brand-primary/20">
                  GR# {student.grNo || 'N/A'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getStatusBadgeClass(
                    student.status
                  )}`}
                >
                  {student.status || 'Active'}
                </span>
              </div>
              <h2 className="text-lg font-bold text-brand-text-primary tracking-tight mt-1">
                {student.studentName || 'Unnamed Student'}
              </h2>
              <p className="text-xs text-brand-text-secondary">
                S/O or D/O <span className="font-semibold text-brand-text-primary">{student.fatherName || 'N/A'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5 text-xs">
          {/* Academic Profile */}
          <div className="rounded-xl bg-brand-bg p-4 border border-brand-border">
            <div className="flex items-center gap-2 mb-3 text-brand-primary font-bold text-xs uppercase tracking-wider">
              <GraduationCap className="w-4 h-4" />
              <span>Academic Enrollment Details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-brand-text-secondary block mb-0.5">Current Class</span>
                <span className="font-bold text-brand-text-primary text-sm">
                  {student.currentClass || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-secondary block mb-0.5">Section</span>
                <span className="font-bold text-brand-text-primary text-sm">
                  {student.section || 'A'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-secondary block mb-0.5">Class Admitted</span>
                <span className="font-semibold text-brand-text-primary">
                  {student.classAdmitted || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-secondary block mb-0.5">Shift & Medium</span>
                <span className="font-semibold text-brand-text-primary">
                  {student.shift || 'Morning'} / {student.medium || 'English'}
                </span>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div>
            <div className="flex items-center gap-2 mb-2.5 text-brand-primary font-bold text-xs uppercase tracking-wider">
              <User className="w-4 h-4" />
              <span>Student Personal Details</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 bg-white dark:bg-brand-surface p-3.5 rounded-xl border border-brand-border">
              <div>
                <span className="text-brand-text-secondary block">Gender</span>
                <span className="font-semibold text-brand-text-primary">{student.gender || 'N/A'}</span>
              </div>
              <div>
                <span className="text-brand-text-secondary block">Date of Birth</span>
                <span className="font-semibold text-brand-text-primary">
                  {student.dobDay && student.dobMonth && student.dobYear
                    ? `${student.dobDay}/${student.dobMonth}/${student.dobYear}`
                    : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-brand-text-secondary block">Religion</span>
                <span className="font-semibold text-brand-text-primary">{student.religion || 'Islam'}</span>
              </div>
              <div>
                <span className="text-brand-text-secondary block">B.Form Number</span>
                <span className="font-mono font-medium text-brand-text-primary">{student.bFormNo || 'N/A'}</span>
              </div>
              <div>
                <span className="text-brand-text-secondary block">Parent CNIC</span>
                <span className="font-mono font-medium text-brand-text-primary">{student.parentCnic || 'N/A'}</span>
              </div>
              <div>
                <span className="text-brand-text-secondary block">Admission Date</span>
                <span className="font-semibold text-brand-text-primary">
                  {student.admissionDay && student.admissionMonth && student.admissionYear
                    ? `${student.admissionDay}/${student.admissionMonth}/${student.admissionYear}`
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Contact Numbers & Location */}
          <div>
            <div className="flex items-center gap-2 mb-2.5 text-brand-primary font-bold text-xs uppercase tracking-wider">
              <Phone className="w-4 h-4" />
              <span>Contact & Residential Address</span>
            </div>
            <div className="space-y-2.5 bg-white dark:bg-brand-surface p-3.5 rounded-xl border border-brand-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-brand-bg border border-brand-border/70">
                  <div>
                    <span className="text-[10px] text-brand-text-secondary block">Parent / Guardian Contact</span>
                    <span className="font-mono font-semibold text-brand-text-primary text-xs">
                      {student.parentContact || 'N/A'}
                    </span>
                  </div>
                  {student.parentContact && student.parentContact !== 'NA' && student.parentContact !== 'N/A' && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(student.parentContact, 'parentContact')}
                      className="p-1.5 rounded-md hover:bg-brand-surface text-brand-text-secondary hover:text-brand-primary transition-colors"
                      title="Copy phone number"
                    >
                      {copiedKey === 'parentContact' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-brand-bg border border-brand-border/70">
                  <div>
                    <span className="text-[10px] text-brand-text-secondary block">Emergency Contact</span>
                    <span className="font-mono font-semibold text-brand-text-primary text-xs">
                      {student.emergencyContact || 'N/A'}
                    </span>
                  </div>
                  {student.emergencyContact && student.emergencyContact !== 'NA' && student.emergencyContact !== 'N/A' && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(student.emergencyContact, 'emergencyContact')}
                      className="p-1.5 rounded-md hover:bg-brand-surface text-brand-text-secondary hover:text-brand-primary transition-colors"
                      title="Copy phone number"
                    >
                      {copiedKey === 'emergencyContact' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-brand-bg border border-brand-border/70 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-brand-text-secondary flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-brand-text-secondary block">Residential Address</span>
                  <span className="font-medium text-brand-text-primary text-xs leading-relaxed">
                    {student.address || 'Address not recorded in register'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Spreadsheet Meta */}
          <div className="text-[11px] text-brand-text-secondary flex items-center justify-between px-1">
            <span>
              Google Spreadsheet Row: <span className="font-mono font-semibold text-brand-text-primary">#{student.rowNumber}</span>
            </span>
            <span>Sheet: Jamshoro South Final SPD (2)</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-brand-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg border border-brand-border transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(student);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit Student Record</span>
          </button>
        </div>
      </div>
    </div>
  );
};

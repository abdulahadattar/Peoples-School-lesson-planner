import React from 'react';
import {
  GraduationCap,
  User,
  Phone,
  MapPin,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { DocumentDiscrepancy } from '../../types/documentArchive';
import { useClipboardCopy } from '../../hooks/useClipboardCopy';

export interface StudentDetailsTabProps {
  student: StudentRecord;
  activeFlags: DocumentDiscrepancy[];
  onSwitchToDocumentsTab: () => void;
}

export const StudentDetailsTab: React.FC<StudentDetailsTabProps> = ({
  student,
  activeFlags,
  onSwitchToDocumentsTab,
}) => {
  const { copy: copyToClipboard, copiedKey } = useClipboardCopy(2000);

  return (
    <div className="space-y-5">
      {/* Discrepancy Callout if exists */}
      {activeFlags.length > 0 && (
        <div
          onClick={onSwitchToDocumentsTab}
          className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-3.5 flex items-center justify-between cursor-pointer hover:bg-rose-100/60 dark:hover:bg-rose-900/40 transition-colors shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-rose-900 dark:text-rose-200 text-xs">
                {activeFlags.length} Document Discrepanc{activeFlags.length > 1 ? 'ies' : 'y'} Flagged
              </h4>
              <p className="text-[11px] text-rose-700 dark:text-rose-300">
                Differences found between uploaded scans and this register record. Click to review side-by-side.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white flex-shrink-0">
            Review Scans
          </span>
        </div>
      )}

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
                  className="p-1.5 rounded min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-primary transition-colors cursor-pointer"
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
                  className="p-1.5 rounded min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-primary transition-colors cursor-pointer"
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
  );
};

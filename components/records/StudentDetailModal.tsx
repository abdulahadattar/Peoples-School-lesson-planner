import React, { useState, useEffect } from 'react';
import {
  X,
  Edit2,
  Phone,
  User,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { PhssjLogo } from '../Logo';
import { StudentDocumentsTab } from './StudentDocumentsTab';
import { StudentDetailsTab } from './StudentDetailsTab';
import { fetchDossierByGr, auditDossier } from '../../services/documentClientService';
import { StudentDossier, DocumentDiscrepancy } from '../../types/documentArchive';
import { StatusBadge } from '../ui/StatusBadge';

interface StudentDetailModalProps {
  isOpen: boolean;
  student: StudentRecord | null;
  initialTab?: 'details' | 'documents';
  onClose: () => void;
  onEdit?: (student: StudentRecord) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  isOpen,
  student,
  initialTab = 'details',
  onClose,
  onEdit,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>(initialTab);
  const [dossier, setDossier] = useState<StudentDossier | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DocumentDiscrepancy[]>([]);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (student && isOpen) {
      fetchDossierByGr(student.grNo).then((d) => setDossier(d));
      auditDossier(student.grNo, student).then((flags) => setDiscrepancies(flags));
    }
  }, [student, isOpen]);

  if (!isOpen || !student) return null;

  const activeFlags = discrepancies.filter((f) => !f.isDismissed);
  const docCount = dossier?.documents.length || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card p-6 flex flex-col max-h-[90dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-brand-border">
          <div className="flex items-center gap-3.5">
            {/* Student Photo or Logo */}
            <div
              onClick={() => {
                if (dossier?.avatarUrl) setPreviewPhotoUrl(dossier.avatarUrl);
              }}
              className={`w-14 h-14 rounded-full bg-white dark:bg-slate-900 shadow-soft border border-brand-border flex items-center justify-center p-0.5 ring-1 ring-black/5 dark:ring-white/10 flex-shrink-0 overflow-hidden ${
                dossier?.avatarUrl ? 'cursor-pointer hover:ring-2 hover:ring-brand-primary' : ''
              }`}
              title={dossier?.avatarUrl ? 'Click to view full photo' : 'Student Avatar'}
            >
              {dossier?.avatarUrl ? (
                <img
                  src={dossier.avatarUrl}
                  alt={student.studentName}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <PhssjLogo className="w-full h-full rounded-full" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary font-mono text-xs font-bold border border-brand-primary/20">
                  GR# {student.grNo || 'N/A'}
                </span>
                <StatusBadge label={student.status || 'Active'} size="sm" />
                {docCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {docCount} Scanned Doc(s)
                  </span>
                )}
                {activeFlags.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {activeFlags.length} Discrepancies
                  </span>
                )}
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
            className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 pt-3 pb-1 border-b border-brand-border">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'details'
                ? 'bg-brand-primary text-white shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Student Register Details</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'documents'
                ? 'bg-brand-primary text-white shadow-xs'
                : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Archived Documents & B-Forms ({docCount})</span>
            {activeFlags.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5 text-xs">
          {activeTab === 'documents' ? (
            <StudentDocumentsTab
              student={student}
              onEditStudent={(updated) => {
                onEdit?.(updated);
              }}
            />
          ) : (
            <StudentDetailsTab
              student={student}
              activeFlags={activeFlags}
              onSwitchToDocumentsTab={() => setActiveTab('documents')}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-brand-border">
          <div className="flex items-center gap-2">
            {student.parentContact && student.parentContact !== 'NA' && student.parentContact !== 'N/A' && (
              <a
                href={`tel:${student.parentContact}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-bg hover:bg-brand-border text-brand-primary border border-brand-border transition-colors cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call Guardian</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(student);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Record</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-bg hover:bg-brand-border text-brand-text-secondary hover:text-brand-text-primary border border-brand-border transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Phone, FolderOpen, AlertTriangle, Edit2 } from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { StudentDossier } from '../../types/documentArchive';
import { StudentAvatar, resolveAvatarUrl } from './StudentAvatar';
import { normalizeGrKey } from '../../services/identityNormalization';

export interface StudentCardGridProps {
  paginatedRecords: StudentRecord[];
  dossiersByGr: Record<string, StudentDossier>;
  isSheetEditingLocked: boolean;
  viewMode: 'auto' | 'table' | 'cards';
  onViewDetails: (student: StudentRecord) => void;
  onViewDocuments: (student: StudentRecord) => void;
  onEditStudent: (student: StudentRecord) => void;
  onPreviewAvatar: (preview: { url: string; name: string; grNo: string }) => void;
  getStatusBadge: (status?: string) => React.ReactNode;
}

export const StudentCardGrid: React.FC<StudentCardGridProps> = React.memo(({
  paginatedRecords,
  dossiersByGr,
  isSheetEditingLocked,
  viewMode,
  onViewDetails,
  onViewDocuments,
  onEditStudent,
  onPreviewAvatar,
  getStatusBadge,
}) => {
  return (
    <div
      className={`${
        viewMode === 'cards' ? 'block' : viewMode === 'table' ? 'hidden' : 'block lg:hidden'
      } divide-y divide-brand-border/60 bg-white dark:bg-brand-surface`}
    >
      {paginatedRecords.map((student) => {
        const grClean = normalizeGrKey(String(student.grNo || ''));
        const dossier = dossiersByGr[grClean];
        const docCount = dossier?.documents?.length || 0;
        const hasFlags = (dossier?.allFlags?.length || 0) > 0;
        const resolvedAvatar = resolveAvatarUrl(dossier);

        return (
          <div key={student.rowNumber} className="p-3.5 hover:bg-brand-bg/50 transition-colors space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <StudentAvatar
                  name={student.studentName}
                  grNo={student.grNo}
                  avatarUrl={resolvedAvatar}
                  size="lg"
                  onClick={() => {
                    if (resolvedAvatar) {
                      onPreviewAvatar({
                        url: resolvedAvatar,
                        name: student.studentName,
                        grNo: student.grNo,
                      });
                    } else {
                      onViewDetails(student);
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
                    onClick={() => onViewDetails(student)}
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
                onClick={() => onViewDocuments(student)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
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
                  onClick={() => onViewDetails(student)}
                  className="py-1.5 px-3 rounded-xl text-xs font-semibold bg-brand-bg text-brand-text-primary border border-brand-border hover:bg-brand-border/60 transition-colors cursor-pointer"
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => onEditStudent(student)}
                  disabled={isSheetEditingLocked}
                  className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-colors cursor-pointer ${
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
  );
});

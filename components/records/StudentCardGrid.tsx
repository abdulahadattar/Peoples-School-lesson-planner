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
  isAdmin?: boolean;
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
  isAdmin = false,
  viewMode,
  onViewDetails,
  onViewDocuments,
  onEditStudent,
  onPreviewAvatar,
  getStatusBadge,
}) => {
  const canEdit = !isSheetEditingLocked || isAdmin;

  return (
    <div
      className={`${
        viewMode === 'cards'
          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 p-3.5 sm:p-4'
          : viewMode === 'table'
            ? 'hidden'
            : 'grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 lg:hidden'
      } bg-slate-50/60 dark:bg-slate-950/30`}
    >
      {paginatedRecords.map((student) => {
        const grClean = normalizeGrKey(String(student.grNo || ''));
        const dossier = dossiersByGr[grClean];
        const docCount = dossier?.documents?.length || 0;
        const hasFlags = (dossier?.allFlags?.length || 0) > 0;
        const resolvedAvatar = resolveAvatarUrl(dossier);

        return (
          <div
            key={student.rowNumber}
            className="rounded-2xl bg-white dark:bg-brand-surface border border-black/[0.06] dark:border-white/[0.08] p-4 shadow-xs hover:border-brand-primary/30 transition-[border-color,box-shadow] space-y-3.5 flex flex-col justify-between"
          >
            <div className="flex items-start gap-3">
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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono tabular-nums text-[11px] font-bold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md border border-brand-primary/20">
                    GR# {student.grNo || '—'}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-black/[0.06] dark:border-white/[0.08]">
                    {student.currentClass || '—'}{student.section ? `-${student.section}` : ''}
                  </span>
                  {getStatusBadge(student.status)}
                </div>
                <button
                  type="button"
                  onClick={() => onViewDetails(student)}
                  className="font-bold text-brand-text-primary text-sm tracking-tight mt-1.5 hover:text-brand-primary text-left truncate block w-full cursor-pointer transition-colors"
                  title={student.studentName}
                >
                  {student.studentName || '—'}
                </button>
                <p className="text-xs text-brand-text-secondary truncate">
                  S/O {student.fatherName || '—'}
                </p>
              </div>
            </div>

            {/* Secondary Details & Quick Contact */}
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50/90 dark:bg-slate-900/50 p-3 rounded-xl border border-black/[0.05] dark:border-white/[0.06]">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold block">
                  Date of Birth
                </span>
                <span className="font-mono tabular-nums text-xs font-medium text-brand-text-primary mt-0.5 block">
                  {student.dobDay && student.dobMonth && student.dobYear
                    ? `${student.dobDay}/${student.dobMonth}/${student.dobYear}`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold block">
                  Parent Contact
                </span>
                {student.parentContact && student.parentContact !== 'NA' && student.parentContact !== 'N/A' ? (
                  <a
                    href={`tel:${student.parentContact}`}
                    className="inline-flex items-center gap-1 text-xs text-brand-primary font-mono tabular-nums font-semibold hover:underline mt-0.5"
                  >
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{student.parentContact}</span>
                  </a>
                ) : (
                  <span className="text-xs text-slate-400 font-mono mt-0.5 block">No Phone</span>
                )}
              </div>
            </div>

            {/* Document Dossier & Action Buttons */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/[0.05] dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => onViewDocuments(student)}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-[color,background-color,border-color,transform] active:scale-[0.98] cursor-pointer ${
                  docCount > 0
                    ? hasFlags
                      ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
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
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-brand-text-primary border border-black/[0.06] dark:border-white/[0.08] hover:bg-slate-200/70 dark:hover:bg-slate-700 active:scale-[0.98] transition-[color,background-color,transform] cursor-pointer"
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => onEditStudent(student)}
                  disabled={!canEdit}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-[color,background-color,transform] ${
                    !canEdit
                      ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                      : 'bg-brand-primary/10 text-brand-primary border-brand-primary/25 hover:bg-brand-primary/20 active:scale-[0.98] cursor-pointer'
                  }`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
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

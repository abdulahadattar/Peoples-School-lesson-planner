import React from 'react';
import { Eye, Edit2, Phone, FolderOpen, Camera, AlertTriangle } from 'lucide-react';
import { StudentRecord } from '../../services/googleSheetsService';
import { StudentDossier } from '../../types/documentArchive';
import { StudentAvatar, resolveAvatarUrl } from './StudentAvatar';

export interface RecordsTableRowProps {
  student: StudentRecord;
  dossier?: StudentDossier;
  isEditingLocked: boolean;
  isAdmin: boolean;
  onViewStudent: (student: StudentRecord) => void;
  onViewDocuments: (student: StudentRecord) => void;
  onEditStudent: (student: StudentRecord) => void;
  onPreviewAvatar: (preview: { url: string; name: string; grNo?: string }) => void;
  getStatusBadge: (status?: string) => React.ReactNode;
}

export const RecordsTableRow: React.FC<RecordsTableRowProps> = React.memo(({
  student,
  dossier,
  isEditingLocked,
  isAdmin,
  onViewStudent,
  onViewDocuments,
  onEditStudent,
  onPreviewAvatar,
  getStatusBadge,
}) => {
  const docCount = dossier?.documents?.length || 0;
  const hasFlags = (dossier?.allFlags?.length || 0) > 0;
  const resolvedAvatar = resolveAvatarUrl(dossier);

  return (
    <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
      {/* Sticky GR# */}
      <td className="py-2.5 px-3.5 md:sticky md:left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-r border-black/[0.06] dark:border-white/[0.08] md:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
        {student.grNo || '—'}
      </td>

      {/* Student Name with Circular Student Avatar */}
      <td className="py-2.5 px-4 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-r border-black/[0.04] dark:border-white/[0.06] whitespace-nowrap">
        <div className="flex items-center gap-2.5">
          <StudentAvatar
            name={student.studentName}
            grNo={student.grNo}
            avatarUrl={resolvedAvatar}
            size="md"
            onClick={() => {
              if (resolvedAvatar) {
                onPreviewAvatar({
                  url: resolvedAvatar,
                  name: student.studentName,
                  grNo: student.grNo,
                });
              } else {
                onViewStudent(student);
              }
            }}
          />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onViewStudent(student)}
              className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left truncate block max-w-[200px] transition-colors cursor-pointer"
              title={student.studentName}
            >
              {student.studentName || '—'}
            </button>
            {docCount > 0 ? (
              <button
                type="button"
                onClick={() => onViewDocuments(student)}
                className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.2 rounded transition-colors cursor-pointer ${
                  hasFlags
                    ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100'
                    : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100'
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
                onClick={() => onViewDocuments(student)}
                className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-0.5 min-h-[24px] px-1 -mx-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Attach student document scan"
              >
                <Camera className="w-2.5 h-2.5 opacity-60" />
                <span>Attach</span>
              </button>
            )}
          </div>
        </div>
      </td>

      {/* Father / Guardian Name */}
      <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap min-w-[210px]" title={student.fatherName}>
        {student.fatherName || '—'}
      </td>

      <td className="py-2.5 px-3 text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 border border-black/[0.06] dark:border-white/[0.08] text-slate-800 dark:text-slate-200">
          {student.currentClass || '—'}
          {student.section ? `-${student.section}` : ''}
        </span>
      </td>

      <td className="py-2.5 px-3 text-center text-slate-500">
        {student.gender || '—'}
      </td>

      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500">
        {student.dobDay && student.dobMonth && student.dobYear
          ? `${student.dobDay}/${student.dobMonth}/${student.dobYear}`
          : '—'}
      </td>

      <td className="py-2.5 px-4 font-mono text-[11px]">
        {student.parentContact && student.parentContact !== 'NA' && student.parentContact !== 'N/A' ? (
          <a
            href={`tel:${student.parentContact}`}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <Phone className="w-3 h-3 flex-shrink-0" />
            <span>{student.parentContact}</span>
          </a>
        ) : (
          <span className="text-slate-400">NA</span>
        )}
      </td>

      <td className="py-2.5 px-4 font-mono text-[11px]">
        {student.emergencyContact && student.emergencyContact !== 'NA' && student.emergencyContact !== 'N/A' ? (
          <span className="text-slate-700 dark:text-slate-300">{student.emergencyContact}</span>
        ) : (
          <span className="text-slate-400">NA</span>
        )}
      </td>

      <td className="py-2.5 px-3 text-center whitespace-nowrap">
        {getStatusBadge(student.status)}
      </td>

      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 truncate max-w-[140px]">
        {student.bFormNo || '—'}
      </td>

      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 truncate max-w-[140px]">
        {student.parentCnic || '—'}
      </td>

      <td className="py-2.5 px-4 text-slate-500 text-[11px] truncate max-w-[220px]" title={student.address}>
        {student.address || '—'}
      </td>

      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500">
        {student.classAdmitted || '—'}
      </td>

      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500">
        {student.admissionDay && student.admissionMonth && student.admissionYear
          ? `${student.admissionDay}/${student.admissionMonth}/${student.admissionYear}`
          : '—'}
      </td>

      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 truncate max-w-[140px]">
        {student.partnerContact || '—'}
      </td>

      <td className="py-2.5 px-3 text-center text-slate-500">
        {student.shift || 'Morning'}
      </td>

      <td className="py-2.5 px-3 text-center text-slate-500">
        {student.medium || 'English'}
      </td>

      {/* Docs & Scans Badge */}
      <td className="py-2.5 px-3 text-center whitespace-nowrap">
        <button
          type="button"
          onClick={() => onViewDocuments(student)}
          className={`inline-flex items-center justify-center gap-1 min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border cursor-pointer active:scale-[0.97] ${
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
      <td className="py-2.5 px-3 text-center md:sticky md:right-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onViewStudent(student)}
            title="View Profile"
            className="p-1.5 rounded-lg min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewDocuments(student)}
            title="View Documents & Scans"
            className="p-1.5 rounded-lg min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          {(!isEditingLocked || isAdmin) && (
            <button
              type="button"
              onClick={() => onEditStudent(student)}
              title="Edit Student Record"
              className="p-1.5 rounded-lg min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

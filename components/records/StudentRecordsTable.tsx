import React from 'react';
import { StudentRecord } from '../../services/googleSheetsService';
import { StudentDossier } from '../../types/documentArchive';
import { SortField, SortDirection } from './types';
import { SortableTableHeader } from '../ui/SortableTableHeader';
import { RecordsTableRow } from './RecordsTableRow';
import { normalizeGrKey } from '../../services/identityNormalization';

export interface StudentRecordsTableProps {
  paginatedRecords: StudentRecord[];
  dossiersByGr: Record<string, StudentDossier>;
  isSheetEditingLocked: boolean;
  isAdmin: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onViewStudent: (student: StudentRecord) => void;
  onViewDocuments: (student: StudentRecord) => void;
  onEditStudent: (student: StudentRecord) => void;
  onPreviewAvatar: (preview: { url: string; name: string; grNo: string } | null) => void;
  getStatusBadge: (status?: string) => React.ReactNode;
}

export const StudentRecordsTable: React.FC<StudentRecordsTableProps> = ({
  paginatedRecords,
  dossiersByGr,
  isSheetEditingLocked,
  isAdmin,
  sortField,
  sortDirection,
  onSort,
  onViewStudent,
  onViewDocuments,
  onEditStudent,
  onPreviewAvatar,
  getStatusBadge,
}) => {
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left border-collapse text-xs min-w-[900px]">
        <thead>
          <tr className="border-b border-brand-border bg-slate-50/80 dark:bg-slate-900/60 font-semibold text-brand-text-secondary uppercase tracking-wider text-[10px]">
            <SortableTableHeader
              field="grNo"
              label="GR#"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="md:sticky md:left-0 z-20 bg-slate-50 dark:bg-slate-900 border-r border-brand-border md:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] w-20 min-w-[72px]"
            />
            <SortableTableHeader
              field="studentName"
              label="Name of Student"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[200px] border-r border-brand-border/40"
            />
            <SortableTableHeader
              field="fatherName"
              label="Father / Guardian Name"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[210px]"
            />
            <SortableTableHeader
              field="currentClass"
              label="Class & Sec"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              align="center"
              className="text-center min-w-[105px]"
            />
            <SortableTableHeader
              field="gender"
              label="Gender"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              align="center"
              className="text-center min-w-[80px]"
            />
            <SortableTableHeader
              field="dob"
              label="DOB (D/M/Y)"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              align="center"
              className="text-center min-w-[105px]"
            />
            <SortableTableHeader
              field="parentContact"
              label="Parent Contact"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[150px]"
            />
            <SortableTableHeader
              field="emergencyContact"
              label="Emergency Contact"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[150px]"
            />
            <SortableTableHeader
              field="status"
              label="Status"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              align="center"
              className="text-center min-w-[120px]"
            />
            <SortableTableHeader
              field="bFormNo"
              label="B.Form No."
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[140px]"
            />
            <SortableTableHeader
              field="parentCnic"
              label="Parent CNIC"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[140px]"
            />
            <SortableTableHeader
              field="address"
              label="Address"
              currentField={sortField}
              currentDirection={sortDirection}
              onSort={onSort}
              className="min-w-[200px]"
            />
            <th className="py-3 px-3 text-center min-w-[100px]">Class Admitted</th>
            <th className="py-3 px-3 text-center min-w-[110px]">Admission Date</th>
            <th className="py-3 px-4 min-w-[140px]">Partner Contact</th>
            <th className="py-3 px-3 text-center min-w-[80px]">Shift</th>
            <th className="py-3 px-3 text-center min-w-[90px]">Medium</th>
            <th className="py-3 px-3 text-center min-w-[110px]">Docs & Scans</th>
            <th className="py-3 px-3 text-center md:sticky md:right-0 z-20 bg-slate-50 dark:bg-slate-900 border-l border-brand-border md:shadow-xs w-28">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border/60">
          {paginatedRecords.map((student) => {
            const grClean = normalizeGrKey(String(student.grNo || ''));
            return (
              <RecordsTableRow
                key={student.rowNumber}
                student={student}
                dossier={dossiersByGr[grClean]}
                isEditingLocked={isSheetEditingLocked}
                isAdmin={isAdmin}
                onViewStudent={onViewStudent}
                onViewDocuments={onViewDocuments}
                onEditStudent={onEditStudent}
                onPreviewAvatar={onPreviewAvatar}
                getStatusBadge={getStatusBadge}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

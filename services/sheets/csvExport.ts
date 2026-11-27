import { triggerFileDownload } from '../../utils/download';
import { StudentRecord, VISIBLE_COLUMNS } from './types';

export function exportRecordsToCSV(records: StudentRecord[], filename: string = 'PHSSJ_Student_Records.csv'): void {
  const headers = VISIBLE_COLUMNS.map((col) => col.label);
  const rows = records.map((record) => {
    return [
      record.grNo,
      record.studentName,
      record.bFormNo,
      record.fatherName,
      record.gender,
      record.dobDay,
      record.dobMonth,
      record.dobYear,
      record.classAdmitted,
      record.currentClass,
      record.parentCnic,
      record.religion,
      record.address,
      record.parentContact,
      record.emergencyContact,
      record.admissionDay,
      record.admissionMonth,
      record.admissionYear,
      record.section,
      record.partnerContact,
      record.shift,
      record.medium,
      record.picture,
      record.status,
    ].map((val) => `"${(val || '').replace(/"/g, '""')}"`);
  });

  const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  triggerFileDownload(csvContent, filename, 'text/csv;charset=utf-8;');
}

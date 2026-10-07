import { DocumentDiscrepancy } from '../../../types/documentArchive';
import { StudentRecord } from '../../../services/googleSheetsService';

export function resolveTargetField(flag: DocumentDiscrepancy): string {
  if (flag.suggestedCorrection?.field) {
    return flag.suggestedCorrection.field;
  }
  const f = flag.field.toLowerCase();
  if (f.includes('bform') || f.includes('b-form') || f.includes('crc')) return 'bFormNo';
  if (f.includes('father')) return 'fatherName';
  if (f.includes('student') || f.includes('name')) return 'studentName';
  if (f.includes('cnic')) return 'parentCnic';
  if (f.includes('dob') || f.includes('birth')) return 'dob';
  return 'bFormNo';
}

export function applyFieldToStudent(student: StudentRecord, targetField: string, finalValue: string): StudentRecord {
  const updated = { ...student };
  if (targetField === 'studentName') updated.studentName = finalValue;
  else if (targetField === 'fatherName') updated.fatherName = finalValue;
  else if (targetField === 'bFormNo') updated.bFormNo = finalValue;
  else if (targetField === 'parentCnic') updated.parentCnic = finalValue;
  else if (targetField === 'dob') {
    const parts = finalValue.split(/[-/]/);
    if (parts.length === 3) {
      updated.dobDay = parts[0];
      updated.dobMonth = parts[1];
      updated.dobYear = parts[2];
    }
  }
  return updated;
}

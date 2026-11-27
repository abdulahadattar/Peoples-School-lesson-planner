import { StudentRecord } from '../../services/googleSheetsService';
import { CLASS_ORDER } from './ClassAnalyticsCharts';
import { SortField, SortDirection } from './types';

export interface StudentFilterCriteria {
  searchQuery: string;
  selectedClass: string;
  selectedSection: string;
  selectedStatus: string;
  selectedGender: string;
}

export function filterStudentRecords(
  records: StudentRecord[],
  criteria: StudentFilterCriteria
): StudentRecord[] {
  const q = criteria.searchQuery.toLowerCase().trim();

  return records.filter((r) => {
    if (q) {
      const matchesName = r.studentName.toLowerCase().includes(q);
      const matchesFather = r.fatherName.toLowerCase().includes(q);
      const matchesGr = r.grNo.toLowerCase().includes(q);
      const matchesContact =
        r.parentContact.toLowerCase().includes(q) ||
        r.emergencyContact.toLowerCase().includes(q) ||
        r.partnerContact.toLowerCase().includes(q);
      const matchesBform = r.bFormNo.toLowerCase().includes(q);
      const matchesCnic = r.parentCnic.toLowerCase().includes(q);
      const matchesAddress = r.address.toLowerCase().includes(q);

      if (
        !matchesName &&
        !matchesFather &&
        !matchesGr &&
        !matchesContact &&
        !matchesBform &&
        !matchesCnic &&
        !matchesAddress
      ) {
        return false;
      }
    }

    if (criteria.selectedClass !== 'all' && r.currentClass.trim() !== criteria.selectedClass) return false;
    if (criteria.selectedSection !== 'all' && r.section.trim() !== criteria.selectedSection) return false;
    if (criteria.selectedStatus !== 'all' && r.status.trim() !== criteria.selectedStatus) return false;
    if (criteria.selectedGender !== 'all' && r.gender.toLowerCase() !== criteria.selectedGender.toLowerCase()) return false;

    return true;
  });
}

export function sortStudentRecords(
  records: StudentRecord[],
  sortField: SortField,
  sortDirection: SortDirection
): StudentRecord[] {
  const list = [...records];
  list.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'grNo': {
        const numA = parseInt((a.grNo || '').replace(/\D/g, ''), 10);
        const numB = parseInt((b.grNo || '').replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          cmp = numA - numB;
        } else {
          cmp = (a.grNo || '').localeCompare(b.grNo || '', undefined, { numeric: true });
        }
        break;
      }
      case 'studentName':
        cmp = (a.studentName || '').localeCompare(b.studentName || '', undefined, { sensitivity: 'base' });
        break;
      case 'fatherName':
        cmp = (a.fatherName || '').localeCompare(b.fatherName || '', undefined, { sensitivity: 'base' });
        break;
      case 'currentClass': {
        const orderA = CLASS_ORDER[(a.currentClass || '').trim().toUpperCase()] ?? 99;
        const orderB = CLASS_ORDER[(b.currentClass || '').trim().toUpperCase()] ?? 99;
        if (orderA !== orderB) {
          cmp = orderA - orderB;
        } else {
          cmp = (a.section || '').localeCompare(b.section || '');
        }
        break;
      }
      case 'gender':
        cmp = (a.gender || '').localeCompare(b.gender || '');
        break;
      case 'dob': {
        const yA = parseInt(a.dobYear, 10) || 0;
        const mA = parseInt(a.dobMonth, 10) || 0;
        const dA = parseInt(a.dobDay, 10) || 0;
        const yB = parseInt(b.dobYear, 10) || 0;
        const mB = parseInt(b.dobMonth, 10) || 0;
        const dB = parseInt(b.dobDay, 10) || 0;
        cmp = (yA * 10000 + mA * 100 + dA) - (yB * 10000 + mB * 100 + dB);
        break;
      }
      case 'parentContact':
        cmp = (a.parentContact || '').localeCompare(b.parentContact || '');
        break;
      case 'emergencyContact':
        cmp = (a.emergencyContact || '').localeCompare(b.emergencyContact || '');
        break;
      case 'status':
        cmp = (a.status || '').localeCompare(b.status || '');
        break;
      case 'bFormNo':
        cmp = (a.bFormNo || '').localeCompare(b.bFormNo || '');
        break;
      case 'parentCnic':
        cmp = (a.parentCnic || '').localeCompare(b.parentCnic || '');
        break;
      case 'address':
        cmp = (a.address || '').localeCompare(b.address || '');
        break;
      default:
        cmp = 0;
    }

    return sortDirection === 'desc' ? -cmp : cmp;
  });

  return list;
}

export function calculateStudentStats(records: StudentRecord[]) {
  let promoted = 0;
  let newEnrollment = 0;
  let dropOut = 0;
  let male = 0;
  let female = 0;

  records.forEach((r) => {
    const s = (r.status || '').toLowerCase();
    if (s.includes('promot') || s.includes('active')) promoted++;
    else if (s.includes('new') || s.includes('enroll')) newEnrollment++;
    else if (s.includes('drop') || s.includes('struck') || s.includes('left')) dropOut++;

    const g = (r.gender || '').toLowerCase();
    if (g.startsWith('m')) male++;
    else if (g.startsWith('f')) female++;
  });

  return {
    total: records.length,
    promoted,
    newEnrollment,
    dropOut,
    male,
    female,
  };
}

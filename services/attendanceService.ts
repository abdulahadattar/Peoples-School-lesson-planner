import { StudentRecord } from './googleSheetsService';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import timetableData from '../data/timetable.json';

export interface ClassEnrollment {
  classKey: string;
  romanName: string;
  displayName: string;
  enrolledBoys: number;
  enrolledGirls: number;
}

export interface ClassAttendanceRow extends ClassEnrollment {
  classTeacher?: string;
  totalEnrolled: number;
  presentBoys: number | '';
  presentGirls: number | '';
  totalPresent: number;
  absentBoys: number;
  absentGirls: number;
  absentTotal: number;
  percentage: number;
  boysPercentage: number;
  girlsPercentage: number;
}

export interface DailyAttendanceRecord {
  date: string;
  recordedBy: string;
  notes: string;
  updatedAt: number;
  classes: Record<string, { presentBoys: number; presentGirls: number; classTeacher?: string }>;
}

export function cleanAttendanceInCharge(val?: string): string {
  if (!val) return 'Miss Shahida';
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === 'class in-charge' ||
    lower === 'class in charge' ||
    lower === 'class teacher' ||
    lower === 'in-charge' ||
    lower === 'in charge' ||
    lower === 'incharge' ||
    lower === 'teacher' ||
    lower === 'class incharge' ||
    lower === ''
  ) {
    return 'Miss Shahida';
  }
  return trimmed;
}

export interface SchoolAttendanceSummary {
  totalEnrolled: number;
  enrolledBoys: number;
  enrolledGirls: number;
  totalPresent: number;
  presentBoys: number;
  presentGirls: number;
  totalAbsent: number;
  absentBoys: number;
  absentGirls: number;
  overallPercentage: number;
  boysPercentage: number;
  girlsPercentage: number;
}

export const DEFAULT_GRADE_ENROLLMENTS: ClassEnrollment[] = [
  { classKey: 'ECCE', romanName: 'Ecce', displayName: 'Ecce', enrolledBoys: 30, enrolledGirls: 20 },
  { classKey: 'IA', romanName: 'IA', displayName: 'IA', enrolledBoys: 27, enrolledGirls: 19 },
  { classKey: 'IB', romanName: 'IB', displayName: 'IB', enrolledBoys: 32, enrolledGirls: 15 },
  { classKey: 'II', romanName: 'II', displayName: 'II', enrolledBoys: 34, enrolledGirls: 23 },
  { classKey: 'IIIA', romanName: 'IIIA', displayName: 'IIIA', enrolledBoys: 19, enrolledGirls: 29 },
  { classKey: 'IIIB', romanName: 'IIIB', displayName: 'IIIB', enrolledBoys: 26, enrolledGirls: 20 },
  { classKey: 'IVA', romanName: 'IVA', displayName: 'IVA', enrolledBoys: 29, enrolledGirls: 16 },
  { classKey: 'IVB', romanName: 'IVB', displayName: 'IVB', enrolledBoys: 26, enrolledGirls: 21 },
  { classKey: 'V', romanName: 'V', displayName: 'V', enrolledBoys: 31, enrolledGirls: 15 },
  { classKey: 'VIA', romanName: 'VIA', displayName: 'VIA', enrolledBoys: 9, enrolledGirls: 36 },
  { classKey: 'VIB', romanName: 'VIB', displayName: 'VIB', enrolledBoys: 38, enrolledGirls: 7 },
  { classKey: 'VII', romanName: 'VII', displayName: 'VII', enrolledBoys: 31, enrolledGirls: 22 },
  { classKey: 'VIII', romanName: 'VIII', displayName: 'VIII', enrolledBoys: 29, enrolledGirls: 15 },
  { classKey: 'IX', romanName: 'IX', displayName: 'IX', enrolledBoys: 40, enrolledGirls: 26 },
  { classKey: 'XA', romanName: 'XA', displayName: 'XA', enrolledBoys: 7, enrolledGirls: 36 },
  { classKey: 'XB', romanName: 'XB', displayName: 'XB', enrolledBoys: 35, enrolledGirls: 6 },
  { classKey: 'XI', romanName: 'XI', displayName: 'XI', enrolledBoys: 18, enrolledGirls: 37 },
  { classKey: 'XII', romanName: 'XII', displayName: 'XII', enrolledBoys: 28, enrolledGirls: 9 },
];

export function computeEnrollmentsFromRecords(records: StudentRecord[]): ClassEnrollment[] {
  const classMap = new Map<string, { boys: number; girls: number }>();

  records.forEach((r) => {
    // Basic dropout exclusion logic (customize if status matters more)
    if (r.status?.toLowerCase().includes('dropout') || r.status?.toLowerCase().includes('left')) return;

    let c = r.currentClass?.trim() || 'UNKNOWN';
    if (r.section?.trim()) {
      c += '-' + r.section.trim();
    }
    
    if (!classMap.has(c)) {
      classMap.set(c, { boys: 0, girls: 0 });
    }
    const counts = classMap.get(c)!;
    if (r.gender?.toLowerCase() === 'female' || r.gender?.toLowerCase() === 'girl') {
      counts.girls += 1;
    } else {
      counts.boys += 1; // Default to boy for ambiguous, or explicitly handle
    }
  });

  return DEFAULT_GRADE_ENROLLMENTS.map(def => {
    const r = def.romanName.toLowerCase();
    const c = def.classKey.toLowerCase();
    
    let totalBoys = 0;
    let totalGirls = 0;
    
    Array.from(classMap.entries()).forEach(([k, counts]) => {
      const kl = k.toLowerCase().trim();
      
      // Exact match for class or class-section (e.g. IV-A matches IV-A)
      if (kl === r || kl === c) {
        totalBoys += counts.boys;
        totalGirls += counts.girls;
      }
      // If def is just a class (e.g. V) but the sheet has sections (e.g. V-A, V-B), aggregate them
      // ONLY if there isn't a specific def for that section.
      else if (!r.includes('-') && (kl.startsWith(r + '-') || kl.startsWith(c + '-'))) {
        // Check if there's a more specific def (like VI-A when def is VI)
        const hasSpecificDef = DEFAULT_GRADE_ENROLLMENTS.some(d => d.romanName.toLowerCase() === kl || d.classKey.toLowerCase() === kl);
        if (!hasSpecificDef) {
          totalBoys += counts.boys;
          totalGirls += counts.girls;
        }
      }
    });

    if (totalBoys > 0 || totalGirls > 0) {
      return {
        ...def,
        enrolledBoys: totalBoys,
        enrolledGirls: totalGirls,
      };
    }
    return def;
  });
}

export function buildAttendanceRows(
  enrollments: ClassEnrollment[],
  inputs: Record<string, { presentBoys: number | ''; presentGirls: number | ''; classTeacher?: string }>
): ClassAttendanceRow[] {
  return enrollments.map(enr => {
    const totalEnrolled = enr.enrolledBoys + enr.enrolledGirls;
    const input = inputs[enr.classKey] || { presentBoys: '', presentGirls: '', classTeacher: '' };

    const pb = typeof input.presentBoys === 'number' ? input.presentBoys : 0;
    const pg = typeof input.presentGirls === 'number' ? input.presentGirls : 0;

    const totalPresent = pb + pg;
    const absentBoys = Math.max(0, enr.enrolledBoys - pb);
    const absentGirls = Math.max(0, enr.enrolledGirls - pg);
    const absentTotal = absentBoys + absentGirls;

    const percentage = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;
    const boysPercentage = enr.enrolledBoys > 0 ? Math.round((pb / enr.enrolledBoys) * 100) : 0;
    const girlsPercentage = enr.enrolledGirls > 0 ? Math.round((pg / enr.enrolledGirls) * 100) : 0;

    // Determine default class teacher from timetable if not provided in inputs
    let defaultTeacher = '';
    const matchingClasses = timetableData.classes.filter(c => c.label === enr.romanName);
    if (matchingClasses.length > 0) {
      const teachers = Array.from(new Set(matchingClasses.map(c => c.classTeacher).filter(Boolean)));
      defaultTeacher = teachers.join(' / ');
    } else {
      // Placeholder for early grades (ECCE, Grade 1 to Grade 3)
      defaultTeacher = '(To be added)';
    }

    return {
      ...enr,
      classTeacher: input.classTeacher || defaultTeacher,
      totalEnrolled,
      presentBoys: input.presentBoys,
      presentGirls: input.presentGirls,
      totalPresent,
      absentBoys,
      absentGirls,
      absentTotal,
      percentage,
      boysPercentage,
      girlsPercentage,
    };
  });
}

export function calculateSchoolSummary(date: string, rows: ClassAttendanceRow[]): SchoolAttendanceSummary {
  let totalEnrolled = 0;
  let enrolledBoys = 0;
  let enrolledGirls = 0;
  let totalPresent = 0;
  let presentBoys = 0;
  let presentGirls = 0;
  let totalAbsent = 0;
  let absentBoys = 0;
  let absentGirls = 0;

  rows.forEach(r => {
    totalEnrolled += r.totalEnrolled;
    enrolledBoys += r.enrolledBoys;
    enrolledGirls += r.enrolledGirls;
    totalPresent += r.totalPresent;
    presentBoys += typeof r.presentBoys === 'number' ? r.presentBoys : 0;
    presentGirls += typeof r.presentGirls === 'number' ? r.presentGirls : 0;
    totalAbsent += r.absentTotal;
    absentBoys += r.absentBoys;
    absentGirls += r.absentGirls;
  });

  return {
    totalEnrolled,
    enrolledBoys,
    enrolledGirls,
    totalPresent,
    presentBoys,
    presentGirls,
    totalAbsent,
    absentBoys,
    absentGirls,
    overallPercentage: totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0,
    boysPercentage: enrolledBoys > 0 ? Math.round((presentBoys / enrolledBoys) * 100) : 0,
    girlsPercentage: enrolledGirls > 0 ? Math.round((presentGirls / enrolledGirls) * 100) : 0,
  };
}

export async function saveAttendanceRecord(record: DailyAttendanceRecord): Promise<void> {
  try {
    const docRef = doc(db, 'daily_attendance', record.date);
    await setDoc(docRef, record);
    // Also save locally as a fallback
    localStorage.setItem(`attendance_${record.date}`, JSON.stringify(record));
  } catch (error) {
    console.warn("Failed to save to Firestore, saving locally", error);
    localStorage.setItem(`attendance_${record.date}`, JSON.stringify(record));
  }
}

export async function loadAttendanceRecord(date: string): Promise<DailyAttendanceRecord | null> {
  try {
    const docRef = doc(db, 'daily_attendance', date);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as DailyAttendanceRecord;
    }
  } catch (error) {
    console.warn("Failed to load from Firestore, trying local", error);
  }

  // Fallback to local storage
  const localStr = localStorage.getItem(`attendance_${date}`);
  if (localStr) {
    return JSON.parse(localStr);
  }
  return null;
}

export async function loadAttendanceDates(): Promise<{ date: string; totalPresent: number; percentage: number }[]> {
  try {
    const attCol = collection(db, 'daily_attendance');
    const q = query(attCol, orderBy('date', 'desc'), limit(30));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as DailyAttendanceRecord;
      // In a real app we might store totalPresent in the record itself for easy querying
      // For now we return a placeholder or calculate it if needed.
      let totalP = 0;
      let totalE = 1; // dummy denominator
      Object.values(data.classes || {}).forEach(c => {
        totalP += (c.presentBoys || 0) + (c.presentGirls || 0);
      });
      return {
        date: data.date,
        totalPresent: totalP,
        percentage: 0 // Placeholder
      };
    });
  } catch (err) {
    console.warn("Error fetching attendance dates", err);
  }
  
  // Local fallback
  const dates: { date: string; totalPresent: number; percentage: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('attendance_')) {
      const str = localStorage.getItem(key);
      if (str) {
        const data = JSON.parse(str) as DailyAttendanceRecord;
        let totalP = 0;
        Object.values(data.classes || {}).forEach(c => {
          totalP += (c.presentBoys || 0) + (c.presentGirls || 0);
        });
        dates.push({
          date: data.date,
          totalPresent: totalP,
          percentage: 0
        });
      }
    }
  }
  return dates.sort((a, b) => b.date.localeCompare(a.date));
}

export function exportAttendanceCSV(date: string, rows: ClassAttendanceRow[], summary: SchoolAttendanceSummary): void {
  const headers = ['Grade', 'Enrolled Boys', 'Enrolled Girls', 'Total Enrolled', 'Present Boys', 'Present Girls', 'Total Present', 'Total Absent', 'Attendance %'];
  const data = rows.map(r => [
    r.displayName,
    r.enrolledBoys,
    r.enrolledGirls,
    r.totalEnrolled,
    typeof r.presentBoys === 'number' ? r.presentBoys : 0,
    typeof r.presentGirls === 'number' ? r.presentGirls : 0,
    r.totalPresent,
    r.absentTotal,
    `${r.percentage}%`
  ]);

  data.push([
    'TOTAL ATTENDANCE',
    summary.enrolledBoys,
    summary.enrolledGirls,
    summary.totalEnrolled,
    summary.presentBoys,
    summary.presentGirls,
    summary.totalPresent,
    summary.totalAbsent,
    `${summary.overallPercentage}%`
  ]);

  const csvContent = [headers.join(','), ...data.map(d => d.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Attendance_${date}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

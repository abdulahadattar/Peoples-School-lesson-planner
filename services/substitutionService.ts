import { get, set } from 'idb-keyval';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Teacher } from '../types';
import { SubstitutionAssignment } from './storageService';

export type { SubstitutionAssignment };

export interface DailySubstitutionRecord {
  dateKey: string; // YYYY-MM-DD
  absentTeacherIds: string[];
  assignments: SubstitutionAssignment[];
  updatedAt: number;
}

export interface TeacherProxyStats {
  teacherId: string;
  teacherName: string;
  designation?: string;
  todayCount: number;
  thisWeekCount: number;
  thisMonthCount: number;
  totalCount: number;
  recentAssignments: SubstitutionAssignment[];
  loadLevel: 'low' | 'moderate' | 'heavy';
}

const INDEX_KEY = 'phssj_substitutions_date_index_v1';
const RECORD_PREFIX = 'phssj_substitutions_record_';
const LEGACY_KEY = 'phssj_timetable_substitutions_v1';

/**
 * Get the Monday and Saturday date strings for the week containing the given date.
 */
export function getWeekRange(refDate: Date = new Date()): { mondayStr: string; saturdayStr: string } {
  const d = new Date(refDate);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  const pad = (n: number) => String(n).padStart(2, '0');
  const mondayStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  const saturdayStr = `${saturday.getFullYear()}-${pad(saturday.getMonth() + 1)}-${pad(saturday.getDate())}`;

  return { mondayStr, saturdayStr };
}

/**
 * Load substitution record for a specific date from IndexedDB with Firestore fallback.
 */
export async function getSubstitutionsForDate(dateKey: string): Promise<DailySubstitutionRecord> {
  // 1. Try local IndexedDB
  try {
    const local = await get<DailySubstitutionRecord>(`${RECORD_PREFIX}${dateKey}`);
    if (local && local.dateKey === dateKey) {
      return local;
    }
  } catch (err) {
    console.warn('Failed to read substitution from IndexedDB:', err);
  }

  // 2. Try Firestore doc
  try {
    const docRef = doc(db, 'substitutions', dateKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as DailySubstitutionRecord;
      // Cache locally
      await set(`${RECORD_PREFIX}${dateKey}`, data);
      await addDateToIndex(dateKey);
      return data;
    }
  } catch (err) {
    console.warn('Failed to fetch substitutions from Firestore:', err);
  }

  // 3. Check legacy key if it matches today
  try {
    const legacy = await get<{
      absentTeacherIds: string[];
      assignments: SubstitutionAssignment[];
      dateKey: string;
    }>(LEGACY_KEY);
    if (legacy && legacy.dateKey === dateKey) {
      const record: DailySubstitutionRecord = {
        dateKey,
        absentTeacherIds: legacy.absentTeacherIds || [],
        assignments: legacy.assignments || [],
        updatedAt: Date.now(),
      };
      await set(`${RECORD_PREFIX}${dateKey}`, record);
      await addDateToIndex(dateKey);
      return record;
    }
  } catch {
    // Ignore legacy read error
  }

  return {
    dateKey,
    absentTeacherIds: [],
    assignments: [],
    updatedAt: Date.now(),
  };
}

/**
 * Save daily substitution record locally and attempt to sync to Firestore.
 */
export async function saveSubstitutionsForDate(
  dateKey: string,
  absentTeacherIds: string[],
  assignments: SubstitutionAssignment[]
): Promise<void> {
  const record: DailySubstitutionRecord = {
    dateKey,
    absentTeacherIds,
    assignments,
    updatedAt: Date.now(),
  };

  // 1. Save locally to IndexedDB
  try {
    await set(`${RECORD_PREFIX}${dateKey}`, record);
    await addDateToIndex(dateKey);
    // Keep legacy key updated for backward compatibility
    await set(LEGACY_KEY, { dateKey, absentTeacherIds, assignments });
  } catch (err) {
    console.error('Failed to save substitution to IndexedDB:', err);
  }

  // 2. Sync to Firestore (substitutions collection)
  try {
    const docRef = doc(db, 'substitutions', dateKey);
    await setDoc(docRef, record);
  } catch (err) {
    console.warn('Could not sync substitutions to Firestore (will remain stored locally):', err);
  }
}

/**
 * Helper to maintain a list of known dateKeys in IndexedDB.
 */
async function addDateToIndex(dateKey: string) {
  try {
    const index = (await get<string[]>(INDEX_KEY)) || [];
    if (!index.includes(dateKey)) {
      index.push(dateKey);
      index.sort().reverse();
      await set(INDEX_KEY, index);
    }
  } catch (err) {
    console.warn('Failed to update substitutions date index:', err);
  }
}

/**
 * Load all historical substitution records across dates.
 */
export async function getAllSubstitutionsHistory(): Promise<DailySubstitutionRecord[]> {
  const recordsMap = new Map<string, DailySubstitutionRecord>();

  // 1. Fetch from Firestore if possible
  try {
    const colRef = collection(db, 'substitutions');
    const snaps = await getDocs(colRef);
    snaps.forEach(docSnap => {
      const rec = docSnap.data() as DailySubstitutionRecord;
      if (rec && rec.dateKey) {
        recordsMap.set(rec.dateKey, rec);
      }
    });
  } catch (err) {
    console.warn('Firestore history fetch failed, relying on local records:', err);
  }

  // 2. Merge with IndexedDB records
  try {
    const dateIndex = (await get<string[]>(INDEX_KEY)) || [];
    for (const dKey of dateIndex) {
      if (!recordsMap.has(dKey)) {
        const local = await get<DailySubstitutionRecord>(`${RECORD_PREFIX}${dKey}`);
        if (local) {
          recordsMap.set(dKey, local);
        }
      }
    }
  } catch (err) {
    console.warn('Failed to read IndexedDB history:', err);
  }

  return Array.from(recordsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

/**
 * Compute faculty proxy stats: counts this week, this month, today, and total load level.
 */
export function computeTeacherProxyStats(
  teachers: Teacher[],
  records: DailySubstitutionRecord[],
  referenceDate: Date = new Date()
): TeacherProxyStats[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${referenceDate.getFullYear()}-${pad(referenceDate.getMonth() + 1)}-${pad(referenceDate.getDate())}`;
  const monthPrefix = `${referenceDate.getFullYear()}-${pad(referenceDate.getMonth() + 1)}`;
  const { mondayStr, saturdayStr } = getWeekRange(referenceDate);

  // Group all assignments by teacher
  const teacherMap = new Map<
    string,
    {
      todayCount: number;
      thisWeekCount: number;
      thisMonthCount: number;
      totalCount: number;
      recentAssignments: SubstitutionAssignment[];
    }
  >();

  teachers.forEach(t => {
    teacherMap.set(t.id, {
      todayCount: 0,
      thisWeekCount: 0,
      thisMonthCount: 0,
      totalCount: 0,
      recentAssignments: [],
    });
  });

  for (const record of records) {
    const isToday = record.dateKey === todayStr;
    const isThisWeek = record.dateKey >= mondayStr && record.dateKey <= saturdayStr;
    const isThisMonth = record.dateKey.startsWith(monthPrefix);

    for (const assignment of record.assignments || []) {
      const tId = assignment.proxyTeacherId;
      // Match by ID or name
      const targetTeacher = teachers.find(
        t => t.id === tId || t.name.trim().toLowerCase() === assignment.proxyTeacherName.trim().toLowerCase()
      );

      if (targetTeacher) {
        const stats = teacherMap.get(targetTeacher.id);
        if (stats) {
          stats.totalCount += 1;
          if (isToday) stats.todayCount += 1;
          if (isThisWeek) stats.thisWeekCount += 1;
          if (isThisMonth) stats.thisMonthCount += 1;
          stats.recentAssignments.push(assignment);
        }
      }
    }
  }

  // Build final array
  return teachers.map(t => {
    const s = teacherMap.get(t.id) || {
      todayCount: 0,
      thisWeekCount: 0,
      thisMonthCount: 0,
      totalCount: 0,
      recentAssignments: [],
    };

    // Determine workload burden level based on this week's assignments
    let loadLevel: 'low' | 'moderate' | 'heavy' = 'low';
    if (s.thisWeekCount >= 3) {
      loadLevel = 'heavy';
    } else if (s.thisWeekCount === 2) {
      loadLevel = 'moderate';
    }

    return {
      teacherId: t.id,
      teacherName: t.name,
      designation: t.designation || 'Faculty Member',
      todayCount: s.todayCount,
      thisWeekCount: s.thisWeekCount,
      thisMonthCount: s.thisMonthCount,
      totalCount: s.totalCount,
      recentAssignments: s.recentAssignments.sort((a, b) => (b.assignedAt || 0) - (a.assignedAt || 0)),
      loadLevel,
    };
  });
}

/**
 * Format official WhatsApp message for staff notifications.
 */
export function formatWhatsAppProxyNotice(
  dateKey: string,
  absentTeacherNames: string[],
  assignments: SubstitutionAssignment[]
): string {
  const d = new Date(dateKey + 'T00:00:00');
  const dateFormatted = d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const lines: string[] = [
    `*PEOPLES HIGHER SECONDARY SCHOOL JAMSHORO*`,
    `*Daily Faculty Substitution & Proxy Notice*`,
    `📅 *Date:* ${dateFormatted}`,
    ``,
  ];

  if (absentTeacherNames.length > 0) {
    lines.push(`⚠️ *Absent Faculty Members:*`);
    absentTeacherNames.forEach(name => {
      lines.push(`• ${name}`);
    });
    lines.push(``);
  }

  if (assignments.length === 0) {
    lines.push(`✅ *All teaching periods are regular today. No proxy assignments required.*`);
  } else {
    lines.push(`📋 *Assigned Proxy Periods:*`);
    // Sort by period number then class
    const sorted = [...assignments].sort(
      (a, b) => a.periodNo - b.periodNo || a.classLabel.localeCompare(b.classLabel)
    );

    sorted.forEach((a, idx) => {
      lines.push(
        `${idx + 1}. *Period ${a.periodNo}* | Class ${a.classLabel}`
      );
      lines.push(`   Subject: ${a.subjectName}`);
      lines.push(`   Assigned Proxy: *${a.proxyTeacherName}* (Relieving: ${a.absentTeacherName})`);
      lines.push(``);
    });
  }

  lines.push(`_Respected teachers are kindly requested to report to their assigned classes promptly._`);
  lines.push(`— *Administration, PHSSJ*`);

  return lines.join('\n');
}

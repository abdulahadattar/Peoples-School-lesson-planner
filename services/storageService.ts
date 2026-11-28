import { get, set } from 'idb-keyval';
import { LessonPlan, GeneratedPaper, TeacherInfo } from '../types';

export interface SavedLessonPlanItem {
  id: string;
  createdAt: number;
  plan: LessonPlan;
  sloId?: string;
  teacherInfo?: TeacherInfo;
}

export interface SavedExamPaperItem {
  id: string;
  createdAt: number;
  paper: GeneratedPaper;
  teacherInfo?: TeacherInfo;
}

const PLANS_KEY = 'phssj_saved_lesson_plans_v1';
const PAPERS_KEY = 'phssj_saved_exam_papers_v1';
const SUBSTITUTIONS_KEY = 'phssj_timetable_substitutions_v1';
const STUDENT_RECORDS_CACHE_KEY = 'phssj_student_records_cache_v2';

export interface CachedStudentRecords {
  records: any[];
  etag?: string;
  timestamp: number;
  sheetTitle?: string;
  spreadsheetId?: string;
  gid?: string;
}

export async function getCachedStudentRecords(cacheKeySuffix: string = 'default'): Promise<CachedStudentRecords | null> {
  try {
    const cached = await get<CachedStudentRecords>(`${STUDENT_RECORDS_CACHE_KEY}_${cacheKeySuffix}`);
    if (cached && Array.isArray(cached.records) && cached.records.length > 0) {
      return cached;
    }
  } catch (err) {
    console.warn('Failed to read cached student records from IndexedDB:', err);
  }
  return null;
}

export async function setCachedStudentRecords(
  data: {
    records: any[];
    etag?: string;
    sheetTitle?: string;
    spreadsheetId?: string;
    gid?: string;
  },
  cacheKeySuffix: string = 'default'
): Promise<void> {
  try {
    const payload: CachedStudentRecords = {
      records: data.records,
      etag: data.etag,
      timestamp: Date.now(),
      sheetTitle: data.sheetTitle,
      spreadsheetId: data.spreadsheetId,
      gid: data.gid,
    };
    await set(`${STUDENT_RECORDS_CACHE_KEY}_${cacheKeySuffix}`, payload);
  } catch (err) {
    console.warn('Failed to save student records cache to IndexedDB:', err);
  }
}

export async function clearCachedStudentRecords(cacheKeySuffix: string = 'default'): Promise<void> {
  try {
    const { del } = await import('idb-keyval');
    await del(`${STUDENT_RECORDS_CACHE_KEY}_${cacheKeySuffix}`);
  } catch (err) {
    console.warn('Failed to clear cached student records from IndexedDB:', err);
  }
}

let cachedPlans: SavedLessonPlanItem[] | null = null;
let cachedPapers: SavedExamPaperItem[] | null = null;
let cachedSubstitutions: {
  dateKey: string;
  absentTeacherIds: string[];
  assignments: SubstitutionAssignment[];
} | null = null;
let inFlightPlansPromise: Promise<SavedLessonPlanItem[]> | null = null;
let inFlightPapersPromise: Promise<SavedExamPaperItem[]> | null = null;

export function peekSavedPlans(): SavedLessonPlanItem[] | null {
  return cachedPlans;
}

export function peekSavedPapers(): SavedExamPaperItem[] | null {
  return cachedPapers;
}

export function peekStoredSubstitutions(dateKey: string): {
  absentTeacherIds: string[];
  assignments: SubstitutionAssignment[];
} | null {
  if (cachedSubstitutions && cachedSubstitutions.dateKey === dateKey) {
    return {
      absentTeacherIds: cachedSubstitutions.absentTeacherIds,
      assignments: cachedSubstitutions.assignments,
    };
  }
  return null;
}

export async function getSavedPlans(): Promise<SavedLessonPlanItem[]> {
  if (cachedPlans) return cachedPlans;
  if (inFlightPlansPromise) return inFlightPlansPromise;
  inFlightPlansPromise = get<SavedLessonPlanItem[]>(PLANS_KEY)
    .then((list) => {
      const normalized = Array.isArray(list) ? list : [];
      cachedPlans = normalized;
      return normalized;
    })
    .catch((err) => {
      console.error('Failed to load saved plans from IndexedDB:', err);
      return [];
    })
    .finally(() => {
      inFlightPlansPromise = null;
    });
  return inFlightPlansPromise;
}

export async function saveLessonPlanToDb(
  plan: LessonPlan,
  sloId?: string,
  teacherInfo?: TeacherInfo
): Promise<SavedLessonPlanItem> {
  const current = await getSavedPlans();
  const id = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item: SavedLessonPlanItem = {
    id,
    createdAt: Date.now(),
    plan,
    sloId,
    teacherInfo,
  };
  // Avoid duplicate by title & subject within 10 minutes
  const filtered = current.filter(
    existing => !(existing.plan.title === plan.title && Math.abs(existing.createdAt - item.createdAt) < 60000)
  );
  const next = [item, ...filtered];
  cachedPlans = next;
  await set(PLANS_KEY, next);
  return item;
}

export async function deleteSavedPlan(id: string): Promise<void> {
  const current = await getSavedPlans();
  const next = current.filter(p => p.id !== id);
  cachedPlans = next;
  await set(PLANS_KEY, next);
}

export async function getSavedPapers(): Promise<SavedExamPaperItem[]> {
  if (cachedPapers) return cachedPapers;
  if (inFlightPapersPromise) return inFlightPapersPromise;
  inFlightPapersPromise = get<SavedExamPaperItem[]>(PAPERS_KEY)
    .then((list) => {
      const normalized = Array.isArray(list) ? list : [];
      cachedPapers = normalized;
      return normalized;
    })
    .catch((err) => {
      console.error('Failed to load saved papers from IndexedDB:', err);
      return [];
    })
    .finally(() => {
      inFlightPapersPromise = null;
    });
  return inFlightPapersPromise;
}

export async function saveExamPaperToDb(
  paper: GeneratedPaper,
  teacherInfo?: TeacherInfo
): Promise<SavedExamPaperItem> {
  const current = await getSavedPapers();
  const id = `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item: SavedExamPaperItem = {
    id,
    createdAt: Date.now(),
    paper,
    teacherInfo,
  };
  const next = [item, ...current];
  cachedPapers = next;
  await set(PAPERS_KEY, next);
  return item;
}

/**
 * Updates an existing saved paper in place, preserving its id, createdAt and
 * teacherInfo so editing a paper from History does not create a duplicate row.
 *
 * Returns true when the record was updated. If the id is no longer present
 * (record deleted in another tab, or a stale link) the paper is saved as a new
 * record and the new id is written back onto `updatedPaper.savedPaperId`, so a
 * previously silent no-op cannot drop the teacher's edit.
 */
export async function updateSavedPaperInDb(
  id: string,
  updatedPaper: GeneratedPaper
): Promise<boolean> {
  const current = await getSavedPapers();
  const index = current.findIndex(p => p.id === id);
  if (index !== -1) {
    const next = [...current];
    next[index] = {
      ...next[index],
      paper: { ...updatedPaper, savedPaperId: id },
    };
    cachedPapers = next;
    await set(PAPERS_KEY, next);
    return true;
  }

  const created = await saveExamPaperToDb(updatedPaper);
  updatedPaper.savedPaperId = created.id;
  return false;
}

export async function deleteSavedPaper(id: string): Promise<void> {
  const current = await getSavedPapers();
  const next = current.filter(p => p.id !== id);
  cachedPapers = next;
  await set(PAPERS_KEY, next);
}

export interface TeacherAbsenceRecord {
  teacherId: string;
  teacherName: string;
  dateKey: string; // YYYY-MM-DD
}

export interface SubstitutionAssignment {
  id: string;
  dateKey: string; // YYYY-MM-DD
  periodNo: number;
  classLabel: string;
  subjectName: string;
  absentTeacherName: string;
  proxyTeacherId: string;
  proxyTeacherName: string;
  assignedAt: number;
  note?: string;
}

export async function getStoredSubstitutions(dateKey: string): Promise<{
  absentTeacherIds: string[];
  assignments: SubstitutionAssignment[];
}> {
  if (cachedSubstitutions && cachedSubstitutions.dateKey === dateKey) {
    return {
      absentTeacherIds: cachedSubstitutions.absentTeacherIds,
      assignments: cachedSubstitutions.assignments,
    };
  }
  try {
    const stored = await get<{
      absentTeacherIds: string[];
      assignments: SubstitutionAssignment[];
      dateKey: string;
    }>(SUBSTITUTIONS_KEY);
    if (stored && stored.dateKey === dateKey) {
      const resolved = {
        absentTeacherIds: stored.absentTeacherIds || [],
        assignments: stored.assignments || [],
      };
      cachedSubstitutions = { dateKey, ...resolved };
      return resolved;
    }
  } catch (err) {
    console.error('Failed to load substitutions from IndexedDB:', err);
  }
  return { absentTeacherIds: [], assignments: [] };
}

export async function saveStoredSubstitutions(
  dateKey: string,
  absentTeacherIds: string[],
  assignments: SubstitutionAssignment[]
): Promise<void> {
  cachedSubstitutions = { dateKey, absentTeacherIds, assignments };
  try {
    await set(SUBSTITUTIONS_KEY, {
      dateKey,
      absentTeacherIds,
      assignments,
    });
  } catch (err) {
    console.error('Failed to save substitutions to IndexedDB:', err);
  }
}

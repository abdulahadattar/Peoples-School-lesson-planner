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

export async function getSavedPlans(): Promise<SavedLessonPlanItem[]> {
  try {
    const list = await get<SavedLessonPlanItem[]>(PLANS_KEY);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Failed to load saved plans from IndexedDB:', err);
    return [];
  }
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
  await set(PLANS_KEY, [item, ...filtered]);
  return item;
}

export async function deleteSavedPlan(id: string): Promise<void> {
  const current = await getSavedPlans();
  await set(PLANS_KEY, current.filter(p => p.id !== id));
}

export async function getSavedPapers(): Promise<SavedExamPaperItem[]> {
  try {
    const list = await get<SavedExamPaperItem[]>(PAPERS_KEY);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Failed to load saved papers from IndexedDB:', err);
    return [];
  }
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
  // Prepend new item
  await set(PAPERS_KEY, [item, ...current]);
  return item;
}

export async function updateSavedPaperInDb(
  id: string,
  updatedPaper: GeneratedPaper
): Promise<void> {
  const current = await getSavedPapers();
  const index = current.findIndex(p => p.id === id);
  if (index !== -1) {
    current[index] = {
      ...current[index],
      paper: updatedPaper,
    };
    await set(PAPERS_KEY, [...current]);
  }
}

export async function deleteSavedPaper(id: string): Promise<void> {
  const current = await getSavedPapers();
  await set(PAPERS_KEY, current.filter(p => p.id !== id));
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
  try {
    const stored = await get<{
      absentTeacherIds: string[];
      assignments: SubstitutionAssignment[];
      dateKey: string;
    }>(SUBSTITUTIONS_KEY);
    if (stored && stored.dateKey === dateKey) {
      return {
        absentTeacherIds: stored.absentTeacherIds || [],
        assignments: stored.assignments || [],
      };
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

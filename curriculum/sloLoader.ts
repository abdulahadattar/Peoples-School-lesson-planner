import { SLO } from '../types';

export interface ChapterInfo {
  id: string;
  name: string;
  chapter_number: number;
  slos: SLO[];
  pdf_url?: string;
}

export interface SubjectInfo {
  id: string;
  name: string;
  chapters: ChapterInfo[];
}

export interface ClassInfo {
  id: string;
  name: string;
  shortName: string;
  subjects: SubjectInfo[];
}

let cachedSloData: { grade: string; data: any }[] | null = null;

/**
 * Load all SLO JSON files from the curriculum/slos directory.
 * Caches the result to avoid repeated fetches.
 */
export async function loadSloData(): Promise<{ grade: string; data: any }[]> {
  if (cachedSloData) return cachedSloData;
  
  const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
  const results: { grade: string; data: any }[] = [];
  
  for (const grade of grades) {
    try {
      const response = await fetch(`/curriculum/slos/${grade}/SUMMARY.json`);
      if (!response.ok) continue;
      
      const summary = await response.json();
      const gradeKey = summary.grade || grade;
      const subjectFiles = summary.grades?.[gradeKey] || summary.subjects || {};
      
      const subjectData: Record<string, any> = {};
      for (const [subjectKey, info] of Object.entries(subjectFiles)) {
        const subjectFile = typeof info === 'string' ? info : (info as any)?.file;
        if (!subjectFile) continue;
        
        try {
          const subjectResponse = await fetch(`/curriculum/slos/${grade}/${subjectFile}`);
          if (subjectResponse.ok) {
            subjectData[subjectKey] = await subjectResponse.json();
          }
        } catch {
          console.warn(`[sloLoader] Failed to load ${grade}/${subjectFile}`);
        }
      }
      
      results.push({ grade, data: subjectData });
    } catch (error) {
      console.error(`[sloLoader] Error loading ${grade}:`, error);
    }
  }
  
  cachedSloData = results;
  return results;
}

/**
 * Get all available grades.
 */
export async function getAllGrades(): Promise<string[]> {
  const data = await loadSloData();
  return data.map(d => d.grade);
}

/**
 * Get all subjects for a specific grade.
 */
export async function getSubjectsForGrade(grade: string): Promise<SubjectInfo[]> {
  const data = await loadSloData();
  const gradeData = data.find(d => d.grade === grade);
  
  if (!gradeData) return [];
  
  const subjects: SubjectInfo[] = [];
  for (const [subjectKey, subjectData] of Object.entries(gradeData.data)) {
    const chapters: ChapterInfo[] = (subjectData as any).chapters?.map((ch: any) => ({
      id: `${grade}-${subjectKey}-ch${ch.chapter_number}`,
      name: ch.chapter_name,
      chapter_number: ch.chapter_number,
      slos: ch.slos || [],
      pdf_url: ch.pdf_url,
    })) || [];
    
    subjects.push({
      id: subjectKey,
      name: formatSubjectName(subjectKey),
      chapters,
    });
  }
  
  return subjects;
}

/**
 * Get chapters for a specific grade and subject.
 */
export async function getChaptersForSubject(
  grade: string,
  subject: string
): Promise<ChapterInfo[]> {
  const data = await loadSloData();
  const gradeData = data.find(d => d.grade === grade);
  
  if (!gradeData) return [];
  
  const subjectData = gradeData.data[subject];
  if (!subjectData) return [];
  
  return (subjectData.chapters || []).map((ch: any) => ({
    id: `${grade}-${subject}-ch${ch.chapter_number}`,
    name: ch.chapter_name,
    chapter_number: ch.chapter_number,
    slos: ch.slos || [],
    pdf_url: ch.pdf_url,
  }));
}

/**
 * Get SLOs for a specific chapter.
 */
export async function getSlosForChapter(
  grade: string,
  subject: string,
  chapterNumber: number
): Promise<SLO[]> {
  const chapters = await getChaptersForSubject(grade, subject);
  const chapter = chapters.find(ch => ch.chapter_number === chapterNumber);
  return chapter?.slos || [];
}

/**
 * Get PDF URL for a specific chapter.
 */
export async function getPdfUrlForChapter(
  grade: string,
  subject: string,
  chapterNumber: number
): Promise<string | null> {
  const chapters = await getChaptersForSubject(grade, subject);
  const chapter = chapters.find(ch => ch.chapter_number === chapterNumber);
  return chapter?.pdf_url || null;
}

/**
 * Format subject key to display name.
 */
export function formatSubjectName(key: string): string {
  const nameMap: Record<string, string> = {
    physics: 'Physics',
    chemistry: 'Chemistry',
    mathematics: 'Mathematics',
    biology: 'Biology',
    english: 'English',
    general_science: 'General Science',
    social_studies: 'Social Studies',
    islamiyat: 'Islamiyat',
    computer_science: 'Computer Science',
    pak_studies: 'Pakistan Studies',
    urdu: 'Urdu',
    general_knowledge: 'General Knowledge',
  };
  
  return nameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Clear cached SLO data to force reload.
 */
export function clearSloCache(): void {
  cachedSloData = null;
}

/**
 * Load chapters for a subject (used for dropdown population).
 */
export async function loadChaptersForSubject(grade: string, subjectId: string): Promise<any[]> {
  const data = await loadSloData();
  const gradeData = data.find(d => d.grade === grade);
  
  if (!gradeData) return [];
  
  const subjectData = gradeData.data[subjectId];
  if (!subjectData) return [];
  
  return (subjectData.chapters || []).map((ch: any) => ({
    id: `${grade}-${subjectId}-ch${ch.chapter_number}`,
    name: ch.chapter_name,
    chapter_number: ch.chapter_number,
    slos: ch.slos || [],
    pdf_url: ch.pdf_url,
  }));
}
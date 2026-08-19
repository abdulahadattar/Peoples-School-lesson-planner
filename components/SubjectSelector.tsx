import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { CurriculumClass } from '../types';

interface SubjectSelectorProps {
  selectedClassId: string;
  selectedSubjectId: string;
  selectedChapterId: string;
  onClassChange: (classId: string) => void;
  onSubjectChange: (subjectId: string) => void;
  onChapterChange: (chapterId: string) => void;
  teacherName: string;
  schoolName: string;
  onTeacherNameChange: (name: string) => void;
  onSchoolNameChange: (name: string) => void;
}

const ChevronDownIcon = () => (
  <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const SubjectSelector: React.FC<SubjectSelectorProps> = ({
  selectedClassId,
  selectedSubjectId,
  selectedChapterId,
  onClassChange,
  onSubjectChange,
  onChapterChange,
  teacherName,
  schoolName,
  onTeacherNameChange,
  onSchoolNameChange,
}) => {
  const [isTeacherInfoOpen, setIsTeacherInfoOpen] = useState(false);

  const classes: CurriculumClass[] = useMemo(() => curriculumData.classes, []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );

  const subjects = useMemo(
    () => selectedClass?.subjects || [],
    [selectedClass]
  );

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );

  const chapters = useMemo(
    () => selectedSubject?.chapters || [],
    [selectedSubject]
  );

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onClassChange(e.target.value);
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSubjectChange(e.target.value);
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChapterChange(e.target.value);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-brand-surface rounded-2xl border border-brand-border shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-brand-text-light tracking-tight">
              Lesson Planner
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-text-medium bg-brand-bg px-2 py-1 rounded-md border border-brand-border">
              Peoples Higher Secondary School Jamshoro
            </span>
          </div>

          <div className="bg-brand-bg rounded-xl border border-brand-border overflow-hidden">
            <button
              type="button"
              onClick={() => setIsTeacherInfoOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-brand-surface transition-colors duration-200 min-h-[44px]"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-brand-text-light">Teacher Information</span>
              </div>
              <span className="text-brand-text-medium transition-transform duration-200">
                {isTeacherInfoOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </span>
            </button>

            <div
              className={`transition-all duration-300 ease-in-out ${
                isTeacherInfoOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-3.5 sm:px-4 pb-3.5 sm:pb-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider">
                    Teacher Name
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => onTeacherNameChange(e.target.value)}
                    placeholder="Enter teacher name"
                    className="w-full h-12 px-3.5 bg-brand-surface border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider">
                    School Name
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={(e) => onSchoolNameChange(e.target.value)}
                    placeholder="Enter school name"
                    className="w-full h-12 px-3.5 bg-brand-surface border border-brand-border rounded-xl text-sm text-brand-text-light placeholder:text-brand-text-medium/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="class-select" className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider">
                Select Class
              </label>
              <div className="relative">
                <select
                  id="class-select"
                  value={selectedClassId}
                  onChange={handleClassChange}
                  className="w-full h-12 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all hover:border-brand-text-medium/40"
                >
                  <option value="">-- Choose a class --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-medium pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="subject-select" className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider">
                Select Subject
              </label>
              <div className="relative">
                <select
                  id="subject-select"
                  value={selectedSubjectId}
                  onChange={handleSubjectChange}
                  disabled={!selectedClassId}
                  className="w-full h-12 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all hover:border-brand-text-medium/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose a subject --</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-medium pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="chapter-select" className="block text-xs font-semibold text-brand-text-medium mb-1.5 uppercase tracking-wider">
                Select Chapter
              </label>
              <div className="relative">
                <select
                  id="chapter-select"
                  value={selectedChapterId}
                  onChange={handleChapterChange}
                  disabled={!selectedSubjectId}
                  className="w-full h-12 px-3.5 pr-10 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-light appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all hover:border-brand-text-medium/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- Choose a chapter --</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-medium pointer-events-none">
                  <ChevronDownIcon />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between text-[11px] text-brand-text-medium bg-brand-bg rounded-lg p-2.5 border border-brand-border">
              <span className="font-mono">
                {selectedClass ? `Class: ${selectedClass.name}` : 'No class selected'}
              </span>
              <span className="font-mono">
                {selectedSubject ? `Subject: ${selectedSubject.name}` : 'No subject selected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubjectSelector;

import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { Teacher } from '../types';
import SelectField from './ui/SelectField';
import Spinner from './ui/Spinner';
import { SkeletonList } from './ui/Skeleton';
import {
  BookOpenIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  SchoolIcon,
  SparklesIcon,
  UserIcon,
} from './icons/MiscIcons';
import {
  autoSelectForTeacher,
  classesForTeacher,
  filterTeachersBySelection,
  sortClassesByGrade,
  subjectsForTeacher,
} from '../services/curriculumHelpers';

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
  generationMode: 'single-slo' | 'whole-chapter' | 'topic';
  onGenerationModeChange: (mode: 'single-slo' | 'whole-chapter' | 'topic') => void;
  topicInput: string;
  onTopicInputChange: (value: string) => void;
  selectedSloIds: string[];
  onSelectedSloIdsChange: (ids: string[]) => void;
  exportFormat: 'docx' | 'pdf' | 'both';
  onExportFormatChange: (format: 'docx' | 'pdf' | 'both') => void;
  selectedTeacherId: string;
  onSelectedTeacherIdChange: (id: string) => void;
  teachers: Teacher[];
  chapterSlos: any[];
  isLoadingSlos: boolean;
  onGenerate: () => void;
  isGenerating: boolean;
}

const MODES = [
  { value: 'topic', label: 'Topic' },
  { value: 'single-slo', label: 'Single SLO' },
  { value: 'whole-chapter', label: 'Whole Chapter' },
] as const;

const EXPORT_FORMATS = [
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'both', label: 'Both' },
] as const;

/** Segmented control — shared by generation mode & export format toggles. */
const SegmentedControl: React.FC<{
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: any) => void;
}> = ({ value, options, onChange }) => (
  <div className="grid gap-2 p-1 bg-brand-bg rounded-xl border border-brand-border" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(option => {
      const isActive = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={isActive}
          className={`relative flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 min-h-[44px] overflow-hidden ${
            isActive ? 'text-white' : 'text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-surface'
          }`}
        >
          {isActive && <span className="absolute inset-0 brand-gradient animate-scaleIn" />}
          <span className="relative z-10 truncate">{option.label}</span>
        </button>
      );
    })}
  </div>
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
  generationMode,
  onGenerationModeChange,
  topicInput,
  onTopicInputChange,
  selectedSloIds,
  onSelectedSloIdsChange,
  exportFormat,
  onExportFormatChange,
  selectedTeacherId,
  onSelectedTeacherIdChange,
  teachers,
  chapterSlos,
  isLoadingSlos,
  onGenerate,
  isGenerating,
}) => {
  const [isTeacherInfoOpen, setIsTeacherInfoOpen] = useState(true);

  const classes = useMemo(() => sortClassesByGrade(curriculumData.classes), []);
  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );
  const selectedTeacher = useMemo(
    () => teachers.find(t => t.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId]
  );

  const filteredTeachers = useMemo(
    () => filterTeachersBySelection(teachers, selectedClassId, selectedSubjectId, classes),
    [teachers, selectedClassId, selectedSubjectId, classes]
  );
  const availableSubjects = useMemo(
    () => subjectsForTeacher(classes, selectedClassId, selectedTeacher),
    [classes, selectedClassId, selectedTeacher]
  );
  const availableClasses = useMemo(
    () => classesForTeacher(classes, selectedTeacher),
    [classes, selectedTeacher]
  );
  const availableChapters = useMemo(
    () => selectedClass?.subjects.find(s => s.id === selectedSubjectId)?.chapters || [],
    [selectedClass, selectedSubjectId]
  );

  const selectedChapter = useMemo(
    () => availableChapters.find(c => c.id === selectedChapterId) || null,
    [availableChapters, selectedChapterId]
  );

  const deselectTeacher = () => {
    onSelectedTeacherIdChange('');
    onTeacherNameChange('');
    onSchoolNameChange('');
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    onClassChange(newClassId);
    if (selectedTeacher && newClassId && !selectedTeacher.classIds?.includes(newClassId)) {
      deselectTeacher();
    }
    onSubjectChange('');
    onChapterChange('');
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubjectId = e.target.value;
    onSubjectChange(newSubjectId);
    if (selectedTeacher && newSubjectId && !selectedTeacher.subjects.some(s => s.toLowerCase() === newSubjectId.toLowerCase())) {
      deselectTeacher();
    }
    onChapterChange('');
  };

  const handleTeacherChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teacherId = e.target.value;
    onSelectedTeacherIdChange(teacherId);
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) {
      onTeacherNameChange('');
      onSchoolNameChange('');
      return;
    }

    onTeacherNameChange(teacher.name);
    onSchoolNameChange(teacher.schoolName);

    // Reset dependent selections before auto-selecting
    onSubjectChange('');
    onChapterChange('');

    const { classId, subjectId } = autoSelectForTeacher(teacher, classes, selectedClassId);
    if (classId) onClassChange(classId);
    if (subjectId) onSubjectChange(subjectId);
  };

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChapterChange(e.target.value);
    onSelectedSloIdsChange([]);
  };

  const handleSloToggle = (sloId: string) => {
    onSelectedSloIdsChange(
      selectedSloIds.includes(sloId)
        ? selectedSloIds.filter(id => id !== sloId)
        : [...selectedSloIds, sloId]
    );
  };

  const handleSelectAllSlos = () => {
    onSelectedSloIdsChange(
      selectedSloIds.length === chapterSlos.length
        ? []
        : chapterSlos.map(s => s.uniqueId || s.SLO_ID)
    );
  };

  const isGenerateDisabled = isGenerating || !selectedClassId || !selectedSubjectId ||
    (generationMode === 'whole-chapter' && !selectedChapterId) ||
    (generationMode === 'single-slo' && (!selectedChapterId || selectedSloIds.length === 0)) ||
    (generationMode === 'topic' && !topicInput.trim());

  const inputClass =
    'w-full h-11 px-4 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all duration-200';

  return (
    <div className="w-full max-w-2xl mx-auto animate-fadeInUp">
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5 sm:p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-card-hover">
                <ClipboardListIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-brand-text-primary tracking-tight leading-tight">
                  Lesson Planner
                </h2>
                <p className="text-[11px] font-medium text-brand-text-secondary mt-0.5">
                  Create structured lesson plans
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-2.5 py-1.5 rounded-lg border border-brand-primary/15">
              <SparklesIcon className="w-3 h-3" />
              PHSSJ
            </span>
          </div>

          {/* Teacher accordion */}
          <div className="bg-brand-bg rounded-xl border border-brand-border overflow-hidden">
            <button
              type="button"
              onClick={() => setIsTeacherInfoOpen(prev => !prev)}
              aria-expanded={isTeacherInfoOpen}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-brand-surface/50 active:bg-brand-surface transition-all duration-200 min-h-[48px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4 text-brand-primary" />
                </div>
                <span className="text-sm font-semibold text-brand-text-primary truncate">
                  {selectedTeacher ? selectedTeacher.name : 'Select Teacher'}
                </span>
                {selectedTeacher && (
                  <span className="hidden sm:inline text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full">
                    {selectedTeacher.subjects.join(', ')}
                  </span>
                )}
              </div>
              <ChevronDownIcon
                className={`w-5 h-5 text-brand-text-secondary flex-shrink-0 transition-transform duration-300 ${isTeacherInfoOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                isTeacherInfoOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-4 pb-4 space-y-3">
                <SelectField
                  id="teacher-select"
                  label="Teacher Name"
                  icon={<UserIcon className="w-3.5 h-3.5" />}
                  value={selectedTeacherId}
                  onChange={handleTeacherChange}
                  className="h-11"
                >
                  <option value="">Choose a teacher...</option>
                  {filteredTeachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.subjects.join(', ')}
                    </option>
                  ))}
                  {filteredTeachers.length === 0 && teachers.length > 0 && (
                    <option value="" disabled>No teachers match current filters</option>
                  )}
                </SelectField>

                {selectedTeacher && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTeacher.classIds?.map(cid => {
                      const labels = selectedTeacher.sectionLabels?.[cid];
                      return labels?.map(label => (
                        <span key={`${cid}-${label}`} className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md border border-brand-primary/15">
                          {label}
                        </span>
                      ));
                    })}
                  </div>
                )}

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                    <SchoolIcon className="w-3.5 h-3.5" />
                    School Name
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={e => onSchoolNameChange(e.target.value)}
                    placeholder="Enter school name"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SelectField
              id="class-select"
              label="Select Class"
              icon={<GraduationCapIcon className="w-3.5 h-3.5" />}
              value={selectedClassId}
              onChange={handleClassChange}
            >
              <option value="">Choose a class</option>
              {(selectedTeacher ? availableClasses : classes).map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </SelectField>

            <SelectField
              id="subject-select"
              label="Select Subject"
              icon={<BookOpenIcon className="w-3.5 h-3.5" />}
              value={selectedSubjectId}
              onChange={handleSubjectChange}
              disabled={!selectedClassId || availableSubjects.length === 0}
            >
              <option value="">Choose a subject</option>
              {availableSubjects.map(subject => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </SelectField>

            <SelectField
              id="chapter-select"
              label="Select Chapter"
              icon={<ClipboardListIcon className="w-3.5 h-3.5" />}
              value={selectedChapterId}
              onChange={handleChapterChange}
              disabled={!selectedSubjectId || availableChapters.length === 0}
            >
              <option value="">Choose a chapter</option>
              {availableChapters.map(chapter => (
                <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
              ))}
            </SelectField>

            {/* Generation mode */}
            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                Generation Mode
              </label>
              <SegmentedControl value={generationMode} options={MODES} onChange={onGenerationModeChange} />
            </div>

            {/* Topic input */}
            {generationMode === 'topic' && (
              <div className="animate-fadeIn">
                <label htmlFor="topic-input" className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Topic Name
                </label>
                <input
                  id="topic-input"
                  type="text"
                  value={topicInput}
                  onChange={e => onTopicInputChange(e.target.value)}
                  placeholder="Enter topic name (e.g., Newton's Laws, Photosynthesis...)"
                  className={inputClass}
                />
              </div>
            )}

            {/* SLO selection */}
            {generationMode === 'single-slo' && selectedChapter && (
              <div className="animate-fadeIn">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide">
                    Select SLO(s) from {selectedChapter.name}
                  </label>
                  {chapterSlos.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllSlos}
                      className="text-[10px] font-semibold text-brand-primary hover:text-brand-primary-hover transition-colors"
                    >
                      {selectedSloIds.length === chapterSlos.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                <div className="bg-brand-bg border border-brand-border rounded-xl p-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {isLoadingSlos ? (
                    <SkeletonList rows={4} />
                  ) : chapterSlos.length === 0 ? (
                    <div className="text-sm text-brand-text-secondary text-center py-4">
                      No SLOs available for this chapter
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chapterSlos.map((slo, idx) => {
                        const sloId = slo.uniqueId || slo.SLO_ID || slo.id || `slo-${idx}`;
                        const isSelected = selectedSloIds.includes(sloId);
                        return (
                          <label
                            key={sloId}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                              isSelected
                                ? 'bg-brand-primary/10 border border-brand-primary/30'
                                : 'bg-brand-surface border border-brand-border hover:border-brand-text-secondary/40 hover:shadow-soft'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSloToggle(sloId)}
                              className="mt-1 w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary focus:ring-offset-0 accent-brand-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-brand-text-primary mb-1">
                                {slo.SLO_Text || slo.text || 'SLO content'}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-brand-text-secondary">
                                <span className="px-2 py-0.5 bg-brand-bg rounded-md border border-brand-border font-mono">
                                  {slo.SLO_ID || slo.id || `SLO-${idx + 1}`}
                                </span>
                                {slo.Cognitive_Level_Code && (
                                  <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-md border border-brand-primary/15 font-semibold">
                                    {slo.Cognitive_Level_Code}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedSloIds.length > 0 && (
                  <div className="mt-2 text-xs text-brand-text-secondary">
                    {selectedSloIds.length} SLO(s) selected
                  </div>
                )}
              </div>
            )}

            {/* Export format */}
            {generationMode !== 'topic' && (
              <div className="animate-fadeIn">
                <label className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Export Format
                </label>
                <SegmentedControl value={exportFormat} options={EXPORT_FORMATS} onChange={onExportFormatChange} />
              </div>
            )}

            {/* Generate button */}
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerateDisabled}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 brand-gradient text-white rounded-xl font-bold text-sm hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand-primary/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-200 min-h-[48px]"
            >
              {isGenerating && <Spinner className="w-4 h-4" />}
              {isGenerating ? 'Generating...' : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Generate Plan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubjectSelector;
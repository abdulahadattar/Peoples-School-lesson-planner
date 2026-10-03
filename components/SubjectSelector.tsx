import React, { useState } from 'react';
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
import { SelectionApi } from '../hooks/useSelection';
import { sectionsByClass, subjectNames } from '../services/teacherRoster';
import SegmentedControl, { EXPORT_FORMATS } from './ui/SegmentedControl';
import { motion } from 'motion/react';

interface SubjectSelectorProps {
  selection: SelectionApi;
  generationMode: 'single-slo' | 'whole-chapter' | 'topic';
  onGenerationModeChange: (mode: 'single-slo' | 'whole-chapter' | 'topic') => void;
  topicInput: string;
  onTopicInputChange: (value: string) => void;
  selectedSloIds: string[];
  onSelectedSloIdsChange: (ids: string[]) => void;
  exportFormat: 'docx' | 'pdf' | 'both';
  onExportFormatChange: (format: 'docx' | 'pdf' | 'both') => void;
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

const SubjectSelector: React.FC<SubjectSelectorProps> = ({
  selection,
  generationMode,
  onGenerationModeChange,
  topicInput,
  onTopicInputChange,
  selectedSloIds,
  onSelectedSloIdsChange,
  exportFormat,
  onExportFormatChange,
  chapterSlos,
  isLoadingSlos,
  onGenerate,
  isGenerating,
}) => {
  const [isTeacherInfoOpen, setIsTeacherInfoOpen] = useState(true);

  const {
    classId: selectedClassId,
    subjectId: selectedSubjectId,
    chapterId: selectedChapterId,
    teacherId: selectedTeacherId,
    teacher: selectedTeacher,
    schoolName,
    classes,
    teacherChoices,
    availableClasses,
    availableSubjects,
    chapters: availableChapters,
    selectedChapter,
    handleClassChange,
    handleSubjectChange,
    handleChapterChange,
    handleTeacherChange,
    setSchoolName,
  } = selection;

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
    'w-full h-11 px-4 bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

  return (
    <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
      <div className="rounded-2xl bg-white dark:bg-brand-surface border border-black/[0.06] dark:border-white/[0.08] shadow-soft">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <ClipboardListIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-brand-text-primary tracking-tight">
                  Lesson Plan Generator
                </h2>
                <p className="text-xs text-brand-text-secondary mt-0.5">
                  Configure curriculum standards and generate formal lesson plans
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">PHSSJ</span>
              <span aria-hidden="true">·</span>
              <span>Curriculum v1</span>
            </div>
          </div>

          {/* Teacher accordion */}
          <div className="bg-slate-50/80 dark:bg-slate-900/40 rounded-xl border border-black/[0.06] dark:border-white/[0.08] overflow-visible">
            <button
              type="button"
              onClick={() => setIsTeacherInfoOpen(prev => !prev)}
              aria-expanded={isTeacherInfoOpen}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors min-h-[48px] cursor-pointer rounded-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="truncate">
                  <span className="text-sm font-semibold text-brand-text-primary">
                    {selectedTeacher ? selectedTeacher.name : 'Select Teacher & School'}
                  </span>
                  {selectedTeacher && (
                    <span className="text-xs text-brand-text-secondary ml-2">
                      ({subjectNames(selectedTeacher).join(', ')})
                    </span>
                  )}
                </div>
              </div>
              <ChevronDownIcon
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isTeacherInfoOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isTeacherInfoOpen && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t border-black/[0.04] dark:border-white/[0.06]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-2">
                  <div>
                    <SelectField
                      id="teacher-select"
                      label="Teacher Name"
                      icon={<UserIcon className="w-3.5 h-3.5" />}
                      value={selectedTeacherId}
                      onChange={e => handleTeacherChange(e.target.value)}
                      className="h-11"
                    >
                      <option value="">Choose a teacher...</option>
                      {teacherChoices.map(t => (
                        <option key={t.id} value={t.id}>
                          {`${t.name} — ${subjectNames(t).join(', ')}`}
                        </option>
                      ))}
                    </SelectField>

                    {selectedTeacher && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(sectionsByClass(selectedTeacher)).map(([cid, labels]) =>
                          labels.map(label => (
                            <span key={`${cid}-${label}`} className="text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 rounded-md">
                              {label}
                            </span>
                          )),
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                      <SchoolIcon className="w-3.5 h-3.5" />
                      School Name
                    </label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={e => setSchoolName(e.target.value)}
                      placeholder="Enter school name"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SelectField
                id="class-select"
                label="Select Class"
                icon={<GraduationCapIcon className="w-3.5 h-3.5" />}
                value={selectedClassId}
                onChange={e => handleClassChange(e.target.value)}
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
                onChange={e => handleSubjectChange(e.target.value)}
                disabled={!selectedClassId || availableSubjects.length === 0}
              >
                <option value="">Choose a subject</option>
                {availableSubjects.map(subject => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </SelectField>

              <div className="sm:col-span-2 lg:col-span-1">
                <SelectField
                  id="chapter-select"
                  label="Select Chapter"
                  icon={<ClipboardListIcon className="w-3.5 h-3.5" />}
                  value={selectedChapterId}
                  onChange={e => handleChapterChange(e.target.value)}
                  disabled={!selectedSubjectId || availableChapters.length === 0}
                  dropdownWidth="xl"
                >
                  <option value="">Choose a chapter</option>
                  {availableChapters.map(chapter => (
                    <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                  ))}
                </SelectField>
              </div>
            </div>

            {/* Generation mode */}
            <div>
              <label className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                Generation Mode
              </label>
              <SegmentedControl value={generationMode} options={MODES} onChange={onGenerationModeChange} />
            </div>

            {/* Topic input */}
            {generationMode === 'topic' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label htmlFor="topic-input" className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Topic Name
                </label>
                <input
                  id="topic-input"
                  type="text"
                  value={topicInput}
                  onChange={e => onTopicInputChange(e.target.value)}
                  placeholder="Enter topic name (e.g., Newton's Laws of Motion, Photosynthesis...)"
                  className={inputClass}
                />
              </motion.div>
            )}

            {/* SLO selection */}
            {generationMode === 'single-slo' && selectedChapter && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wide">
                    Select SLO(s) from {selectedChapter.name}
                  </label>
                  {chapterSlos.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllSlos}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      {selectedSloIds.length === chapterSlos.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/40 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-3 max-h-64 overflow-y-auto custom-scrollbar">
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
                            className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                              isSelected
                                ? 'bg-blue-50/80 dark:bg-blue-950/40 border border-blue-500/30'
                                : 'bg-white dark:bg-brand-surface border border-black/[0.04] dark:border-white/[0.06] hover:border-black/[0.1]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSloToggle(sloId)}
                              className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 accent-blue-600 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-brand-text-primary mb-1">
                                {slo.SLO_Text || slo.text || 'SLO content'}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-brand-text-secondary">
                                <span className="font-mono tabular-nums">
                                  {slo.SLO_ID || slo.id || `SLO-${idx + 1}`}
                                </span>
                                {slo.Cognitive_Level_Code && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                                      {slo.Cognitive_Level_Code}
                                    </span>
                                  </>
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
                  <div className="mt-2 text-xs text-brand-text-secondary font-mono tabular-nums">
                    {selectedSloIds.length} SLO(s) selected
                  </div>
                )}
              </motion.div>
            )}

            {/* Export format */}
            {generationMode !== 'topic' && (
              <div>
                <label className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide">
                  Export Format
                </label>
                <SegmentedControl value={exportFormat} options={EXPORT_FORMATS} onChange={onExportFormatChange} />
              </div>
            )}

            {/* Generate button */}
            <motion.button
              whileTap={{ scale: 0.985 }}
              type="button"
              onClick={onGenerate}
              disabled={isGenerateDisabled}
              className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 min-h-[48px] cursor-pointer"
            >
              {isGenerating && <Spinner className="w-4 h-4" />}
              {isGenerating ? 'Generating Lesson Plan...' : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  <span>Generate Plan</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubjectSelector;

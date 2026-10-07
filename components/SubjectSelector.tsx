import React, { useState } from 'react';
import SelectField from './ui/SelectField';
import Spinner from './ui/Spinner';
import {
  BookOpenIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  SparklesIcon,
} from './icons/MiscIcons';
import { SelectionApi } from '../hooks/useSelection';
import SegmentedControl, { EXPORT_FORMATS } from './ui/SegmentedControl';
import { motion } from 'motion/react';
import { TeacherMetadataPanel } from './lesson/TeacherMetadataPanel';
import { SloSelectionList } from './lesson/SloSelectionList';

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

const INPUT_CLASS =
  'w-full h-11 px-4 bg-slate-50 dark:bg-slate-800/60 border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export const SubjectSelector: React.FC<SubjectSelectorProps> = ({
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
    teacher: selectedTeacher,
    classes,
    availableClasses,
    availableSubjects,
    chapters: availableChapters,
    selectedChapter,
    handleClassChange,
    handleSubjectChange,
    handleChapterChange,
  } = selection;

  const isGenerateDisabled =
    isGenerating ||
    !selectedClassId ||
    !selectedSubjectId ||
    (generationMode === 'whole-chapter' && !selectedChapterId) ||
    (generationMode === 'single-slo' && (!selectedChapterId || selectedSloIds.length === 0)) ||
    (generationMode === 'topic' && !topicInput.trim());

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
          <TeacherMetadataPanel
            selection={selection}
            isOpen={isTeacherInfoOpen}
            onToggle={() => setIsTeacherInfoOpen((prev) => !prev)}
            inputClass={INPUT_CLASS}
          />

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SelectField
                id="class-select"
                label="Select Class"
                icon={<GraduationCapIcon className="w-3.5 h-3.5" />}
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
              >
                <option value="">Choose a class</option>
                {(selectedTeacher ? availableClasses : classes).map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="subject-select"
                label="Select Subject"
                icon={<BookOpenIcon className="w-3.5 h-3.5" />}
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                disabled={!selectedClassId || availableSubjects.length === 0}
              >
                <option value="">Choose a subject</option>
                {availableSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </SelectField>

              <div className="sm:col-span-2 lg:col-span-1">
                <SelectField
                  id="chapter-select"
                  label="Select Chapter"
                  icon={<ClipboardListIcon className="w-3.5 h-3.5" />}
                  value={selectedChapterId}
                  onChange={(e) => handleChapterChange(e.target.value)}
                  disabled={!selectedSubjectId || availableChapters.length === 0}
                  dropdownWidth="xl"
                >
                  <option value="">Choose a chapter</option>
                  {availableChapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </option>
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
                <label
                  htmlFor="topic-input"
                  className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide"
                >
                  Topic Name
                </label>
                <input
                  id="topic-input"
                  type="text"
                  value={topicInput}
                  onChange={(e) => onTopicInputChange(e.target.value)}
                  placeholder="Enter topic name (e.g., Newton's Laws of Motion, Photosynthesis...)"
                  className={INPUT_CLASS}
                />
              </motion.div>
            )}

            {/* SLO selection */}
            {generationMode === 'single-slo' && (
              <SloSelectionList
                selectedChapter={selectedChapter}
                chapterSlos={chapterSlos}
                isLoadingSlos={isLoadingSlos}
                selectedSloIds={selectedSloIds}
                onSelectedSloIdsChange={onSelectedSloIdsChange}
              />
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
              {isGenerating ? (
                'Generating Lesson Plan...'
              ) : (
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

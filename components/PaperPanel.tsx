import React, { useState, useMemo } from 'react';
import { curriculumData } from '../curriculum';
import { Teacher } from '../types';
import SelectField from './ui/SelectField';
import Spinner from './ui/Spinner';
import { DocumentTextIcon, GraduationCapIcon, BookOpenIcon, ClipboardListIcon, SchoolIcon, SparklesIcon, UserIcon } from './icons/MiscIcons';
import { PaperConfig } from '../types';
import {
  autoSelectForTeacher,
  classesForTeacher,
  sortClassesByGrade,
  subjectsForTeacher,
  teacherOptions,
} from '../services/curriculumHelpers';

interface PaperPanelProps {
  onGeneratePaper: (config: PaperConfig) => void;
  isGenerating: boolean;
  teachers: Teacher[];
  selectedTeacherId: string;
  onSelectedTeacherIdChange: (id: string) => void;
  onTeacherNameChange: (name: string) => void;
  onSchoolNameChange: (name: string) => void;
}

const clampNumber = (value: string, min: number, max: number): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
};

const formatMark = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
};

/** Shared styled number input (used for every paper-config field). */
const NumberField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, onChange }) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] text-brand-text-secondary font-medium">{label}</label>
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(clampNumber(e.target.value, min, max))}
      className="w-full h-11 px-3.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary placeholder:text-brand-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  </div>
);

const PaperPanel: React.FC<PaperPanelProps> = ({
  onGeneratePaper,
  isGenerating,
  teachers,
  selectedTeacherId,
  onSelectedTeacherIdChange,
  onTeacherNameChange,
  onSchoolNameChange,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<number>(23);
  const [mcqCount, setMcqCount] = useState<number>(5);
  // Short/long questions the paper LISTS; students attempt any `shortAttemptCount`
  // of the listed short questions (optional = listed - attempted).
  const [shortQuestionCount, setShortQuestionCount] = useState<number>(5);
  const [shortAttemptCount, setShortAttemptCount] = useState<number>(5);
  const [longQuestionCount, setLongQuestionCount] = useState<number>(2);
  const [longAttemptCount, setLongAttemptCount] = useState<number>(2);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  const classes = useMemo(() => sortClassesByGrade(curriculumData.classes), []);
  const selectedTeacher = useMemo(
    () => teachers.find(t => t.id === selectedTeacherId) || null,
    [teachers, selectedTeacherId]
  );

  // Full roster (matching class/subject listed first) so the teacher can
  // always be switched without clearing the class and subject first.
  const teacherChoices = useMemo(
    () => teacherOptions(teachers, selectedClassId, selectedSubjectId, classes),
    [teachers, selectedClassId, selectedSubjectId, classes]
  );
  const availableClasses = useMemo(() => classesForTeacher(classes, selectedTeacher), [classes, selectedTeacher]);
  const availableSubjects = useMemo(
    () => subjectsForTeacher(classes, selectedClassId, selectedTeacher),
    [classes, selectedClassId, selectedTeacher]
  );

  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  );
  const selectedSubject = useMemo(
    () => availableSubjects.find(s => s.id === selectedSubjectId) || null,
    [availableSubjects, selectedSubjectId]
  );
  const chapters = useMemo(() => selectedSubject?.chapters || [], [selectedSubject]);
  const selectedChapter = useMemo(
    () => chapters.find(c => c.id === selectedChapterId) || null,
    [chapters, selectedChapterId]
  );

  const markDistribution = useMemo(() => {
    const MCQ_WEIGHT = 1;
    const SHORT_WEIGHT = 2;
    const LONG_WEIGHT = 4;

    const attemptShort = Math.min(shortAttemptCount, shortQuestionCount);
    const attemptLong = Math.min(longAttemptCount, longQuestionCount);
    const mcqMarks = mcqCount * MCQ_WEIGHT;
    const shortMarks = attemptShort * SHORT_WEIGHT;
    const longMarks = attemptLong * LONG_WEIGHT;
    const totalQuestionMarks = mcqMarks + shortMarks + longMarks;

    return {
      mcqMarks,
      shortMarks,
      longMarks,
      shortAttempt: attemptShort,
      longAttempt: attemptLong,
      mcqPerQuestion: mcqCount > 0 ? MCQ_WEIGHT : 0,
      shortPerQuestion: SHORT_WEIGHT,
      longPerQuestion: LONG_WEIGHT,
      totalQuestionMarks,
    };
  }, [mcqCount, shortQuestionCount, shortAttemptCount, longQuestionCount, longAttemptCount]);

  const deselectTeacher = () => {
    onSelectedTeacherIdChange('');
    onTeacherNameChange('');
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClassId = e.target.value;
    setSelectedClassId(newClassId);
    setSelectedSubjectId('');
    setSelectedChapterId('');
    if (selectedTeacher && newClassId && !selectedTeacher.classIds?.includes(newClassId)) {
      deselectTeacher();
    }
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubjectId = e.target.value;
    setSelectedSubjectId(newSubjectId);
    setSelectedChapterId('');
    if (selectedTeacher && newSubjectId && !selectedTeacher.subjects.some(s => s.toLowerCase() === newSubjectId.toLowerCase())) {
      deselectTeacher();
    }
  };

  const handleTeacherChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teacherId = e.target.value;
    onSelectedTeacherIdChange(teacherId);
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) {
      onTeacherNameChange('');
      return;
    }

    onTeacherNameChange(teacher.name);
    onSchoolNameChange(teacher.schoolName);

    setSelectedChapterId('');
    const auto = autoSelectForTeacher(teacher, classes, selectedClassId);

    // Keep the current class when this teacher teaches it; otherwise move to
    // the teacher's auto/first class.
    const classId =
      selectedClassId && (teacher.classIds ?? []).includes(selectedClassId)
        ? selectedClassId
        : auto.classId || teacher.classIds?.[0] || '';
    setSelectedClassId(classId);

    // Keep the current subject only if this teacher teaches it in that class;
    // otherwise prefer the teacher's auto subject (single-subject teachers),
    // else clear it so the teacher-narrowed subject list drives the choice.
    const teachable = subjectsForTeacher(classes, classId, teacher);
    const subjectId =
      teachable.some(s => s.id === selectedSubjectId) && selectedSubjectId
        ? selectedSubjectId
        : auto.subjectId && teachable.some(s => s.id === auto.subjectId)
          ? auto.subjectId
          : '';
    setSelectedSubjectId(subjectId);
  };

  const handleGenerate = () => {
    const config: PaperConfig = {
      gradeId: selectedClassId,
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId,
      totalMarks,
      mcqCount,
      shortQuestionCount,
      shortAttemptCount: Math.min(shortAttemptCount, shortQuestionCount),
      longQuestionCount,
      longAttemptCount: Math.min(longAttemptCount, longQuestionCount),
      durationMinutes,
      difficulty,
    };
    onGeneratePaper(config);
  };

  const canGenerate = Boolean(selectedClassId && selectedSubjectId && selectedChapterId);
  const marksValid = markDistribution.totalQuestionMarks > 0 && markDistribution.totalQuestionMarks === totalMarks;
  const isDisabled = isGenerating || !canGenerate || !marksValid;

  const shortHasOptional = shortAttemptCount < shortQuestionCount;
  const longHasOptional = longAttemptCount < longQuestionCount;

  const distributionRows = [
    { label: 'MCQ Section', marks: markDistribution.mcqMarks, count: mcqCount, per: markDistribution.mcqPerQuestion, attempt: mcqCount },
    { label: 'Short Answer Section', marks: markDistribution.shortMarks, count: shortQuestionCount, per: markDistribution.shortPerQuestion, attempt: markDistribution.shortAttempt },
    { label: 'Long Answer Section', marks: markDistribution.longMarks, count: longQuestionCount, per: markDistribution.longPerQuestion, attempt: markDistribution.longAttempt },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 md:py-8 animate-fadeInUp">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center flex-shrink-0 text-white shadow-card-hover">
          <DocumentTextIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-brand-text-primary tracking-tight">
            Exam Paper Generator
          </h1>
          <p className="text-xs text-brand-text-secondary">
            Configure and generate an exam paper from the curriculum
          </p>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 space-y-5">
          {/* Selectors */}
          <div className="space-y-3">
            <SelectField
              id="paper-teacher-select"
              label="Select Teacher"
              icon={<UserIcon className="w-3.5 h-3.5" />}
              value={selectedTeacherId}
              onChange={handleTeacherChange}
              className="h-11"
            >
              <option value="">-- Choose a teacher --</option>
              {teacherChoices.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.subjects.join(', ')}
                </option>
              ))}
            </SelectField>

            {selectedTeacher && (
              <div className="flex flex-wrap gap-1">
                {selectedTeacher.classIds?.map(cid => {
                  const labels = selectedTeacher.sectionLabels?.[cid];
                  return labels?.map(label => (
                    <span key={`${cid}-${label}`} className="text-[10px] font-medium text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md border border-brand-primary/15">
                      {label}
                    </span>
                  ));
                })}
              </div>
            )}

            <SelectField
              id="paper-class-select"
              label="Select Class"
              icon={<GraduationCapIcon className="w-3.5 h-3.5" />}
              value={selectedClassId}
              onChange={handleClassChange}
            >
              <option value="">-- Choose a class --</option>
              {(selectedTeacher ? availableClasses : classes).map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </SelectField>

            <SelectField
              id="paper-subject-select"
              label="Select Subject"
              icon={<BookOpenIcon className="w-3.5 h-3.5" />}
              value={selectedSubjectId}
              onChange={handleSubjectChange}
              disabled={!selectedClassId}
            >
              <option value="">-- Choose a subject --</option>
              {availableSubjects.map(subject => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </SelectField>

            <SelectField
              id="paper-chapter-select"
              label="Select Chapter"
              icon={<ClipboardListIcon className="w-3.5 h-3.5" />}
              value={selectedChapterId}
              onChange={e => setSelectedChapterId(e.target.value)}
              disabled={!selectedSubjectId}
            >
              <option value="">-- Choose a chapter --</option>
              {chapters.map(chapter => (
                <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
              ))}
            </SelectField>
          </div>

          {/* Paper configuration */}
          <div>
            <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider mb-3">
              Paper Configuration
            </h3>
            <div className="mb-4">
              <label className="block text-[11px] text-brand-text-secondary font-medium mb-2">Difficulty</label>
              <div className="inline-flex rounded-xl border border-brand-border bg-brand-bg p-1 gap-1">
                {(['easy', 'medium', 'hard'] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200 ${
                      difficulty === level
                        ? 'brand-gradient text-white shadow-sm'
                        : 'text-brand-text-secondary hover:text-brand-text-primary'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <NumberField label="Total Marks" value={totalMarks} min={5} max={100} onChange={setTotalMarks} />
              <NumberField label="Duration (Minutes)" value={durationMinutes} min={15} max={180} onChange={setDurationMinutes} />
              <NumberField label="MCQ Count (1 mark each)" value={mcqCount} min={0} max={50} onChange={setMcqCount} />
              <NumberField
                label="Short Questions on Paper"
                value={shortQuestionCount}
                min={0}
                max={30}
                onChange={v => { setShortQuestionCount(v); setShortAttemptCount(a => Math.min(a, v)); }}
              />
              <NumberField
                label="Short to Attempt (Any)"
                value={shortAttemptCount}
                min={0}
                max={Math.max(1, shortQuestionCount)}
                onChange={setShortAttemptCount}
              />
              <NumberField
                label="Long Questions on Paper"
                value={longQuestionCount}
                min={0}
                max={20}
                onChange={v => { setLongQuestionCount(v); setLongAttemptCount(a => Math.min(a, v)); }}
              />
              <NumberField
                label="Long to Attempt (Any)"
                value={longAttemptCount}
                min={0}
                max={Math.max(1, longQuestionCount)}
                onChange={setLongAttemptCount}
              />
            </div>
            <p className="mt-2 text-[11px] text-brand-text-secondary leading-relaxed">
              Optional questions: set “on paper” higher than “to attempt” to add optional short/long questions students
              can choose from. Marks always follow what students attempt.
            </p>
          </div>

          {/* Live mark distribution summary */}
          <div className="bg-brand-bg rounded-xl border border-brand-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                Mark Distribution
              </h3>
              <span className="text-[11px] font-mono text-brand-text-secondary">
                Total: {totalMarks} marks
              </span>
            </div>
            <div className="space-y-2.5">
              {(shortHasOptional || longHasOptional) && (
                <p className="text-[11px] text-brand-primary/80 bg-brand-primary/5 border border-brand-primary/15 rounded-lg px-3 py-2">
                  Attempt-any: students answer {markDistribution.shortAttempt} of {shortQuestionCount} short and{' '}
                  {markDistribution.longAttempt} of {longQuestionCount} long questions — the rest appear as optional choices.
                </p>
              )}
              {distributionRows.map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-sm text-brand-text-primary">{row.label}</span>
                  <span className="text-xs font-mono text-brand-text-secondary">
                    {formatMark(row.marks)} marks
                    {row.count > 0 && (
                      <span className="hidden sm:inline">
                        {' '}({formatMark(row.per)} × {row.attempt}{row.attempt < row.count ? ` of ${row.count}` : ''})
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div className="border-t border-brand-border/50 pt-2.5 mt-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-brand-text-secondary uppercase tracking-wider">
                  Duration
                </span>
                <span className="text-xs font-mono text-brand-text-primary">
                  {durationMinutes} minutes
                </span>
              </div>
            </div>
          </div>

          {/* Selection summary */}
          {(selectedClass || selectedSubject || selectedChapter) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-brand-text-secondary">
              {selectedClass && (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Class: {selectedClass.shortName}
                </span>
              )}
              {selectedSubject && (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Subject: {selectedSubject.name}
                </span>
              )}
              {selectedChapter && (
                <span className="px-2 py-1 bg-brand-bg rounded-md border border-brand-border/60">
                  Chapter: {selectedChapter.name}
                </span>
              )}
            </div>
          )}

          {/* Generate button */}
          {!marksValid && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium animate-fadeIn">
              Mark distribution mismatch: questions total {markDistribution.totalQuestionMarks} marks, but you selected {totalMarks} marks. Adjust counts to match.
            </div>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isDisabled}
            className="w-full flex items-center justify-center gap-2.5 brand-gradient text-white font-bold py-3 px-5 rounded-xl hover:shadow-glass hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none min-h-[48px]"
          >
            {isGenerating ? (
              <>
                <Spinner className="w-4 h-4" />
                <span className="text-sm">Generating Paper...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                <span className="text-sm">Generate Exam Paper</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaperPanel;
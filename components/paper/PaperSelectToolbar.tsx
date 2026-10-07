import React from 'react';
import { SelectionApi } from '../../hooks/useSelection';
import { subjectNames } from '../../services/teacherRoster';
import SelectField from '../ui/SelectField';
import {
  GraduationCapIcon,
  BookOpenIcon,
  ClipboardListIcon,
  UserIcon,
} from '../icons/MiscIcons';

export interface PaperSelectToolbarProps {
  selection: SelectionApi;
}

export const PaperSelectToolbar: React.FC<PaperSelectToolbarProps> = ({ selection }) => {
  const {
    classId: selectedClassId,
    subjectId: selectedSubjectId,
    chapterId: selectedChapterId,
    teacherId: selectedTeacherId,
    teacherChoices,
    availableClasses,
    availableSubjects,
    chapters,
    handleClassChange,
    handleSubjectChange,
    handleChapterChange,
    handleTeacherChange,
  } = selection;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <SelectField
        id="paper-teacher-select"
        label="Teacher (Optional)"
        value={selectedTeacherId}
        onChange={handleTeacherChange}
        options={teacherChoices.map((t) => ({
          value: t.id,
          label: t.name,
          hint: subjectNames(t).join(', '),
        }))}
        placeholder="All Teachers"
        icon={<UserIcon className="w-4 h-4 text-slate-400" />}
      />
      <SelectField
        id="paper-class-select"
        label="Class / Grade"
        value={selectedClassId}
        onChange={handleClassChange}
        options={availableClasses.map((c) => ({ value: c.id, label: c.name }))}
        placeholder="Select Class"
        icon={<GraduationCapIcon className="w-4 h-4 text-slate-400" />}
      />
      <SelectField
        id="paper-subject-select"
        label="Subject"
        value={selectedSubjectId}
        onChange={handleSubjectChange}
        options={availableSubjects.map((s) => ({ value: s.id, label: s.name }))}
        placeholder="Select Subject"
        disabled={!selectedClassId}
        icon={<BookOpenIcon className="w-4 h-4 text-slate-400" />}
      />
      <SelectField
        id="paper-chapter-select"
        label="Chapter / Unit"
        value={selectedChapterId}
        onChange={handleChapterChange}
        options={chapters.map((c) => ({ value: c.id, label: c.name }))}
        placeholder="Select Chapter"
        disabled={!selectedSubjectId}
        icon={<ClipboardListIcon className="w-4 h-4 text-slate-400" />}
      />
    </div>
  );
};

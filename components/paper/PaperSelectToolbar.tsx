import React from 'react';
import { BookOpen, ClipboardList, GraduationCap, User } from 'lucide-react';
import { SelectionApi } from '../../hooks/useSelection';
import { subjectNames } from '../../services/teacherRoster';
import SelectField from '../ui/SelectField';

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
        onChange={(e) => handleTeacherChange(e.target.value)}
        options={teacherChoices.map((t) => ({
          value: t.id,
          label: t.name,
          sublabel: subjectNames(t).join(', '),
        }))}
        placeholder="All Teachers"
        searchable
        clearable
        icon={<User className="w-4 h-4 text-slate-400" />}
      />
      <SelectField
        id="paper-class-select"
        label="Class / Grade"
        value={selectedClassId}
        onChange={(e) => handleClassChange(e.target.value)}
        options={availableClasses.map((c) => ({ value: c.id, label: c.name }))}
        placeholder="Select Class"
        icon={<GraduationCap className="w-4 h-4 text-slate-400" />}
      />
      <SelectField
        id="paper-subject-select"
        label="Subject"
        value={selectedSubjectId}
        onChange={(e) => handleSubjectChange(e.target.value)}
        options={availableSubjects.map((s) => ({ value: s.id, label: s.name }))}
        placeholder="Select Subject"
        disabled={!selectedClassId}
        icon={<BookOpen className="w-4 h-4 text-slate-400" />}
      />
      <SelectField
        id="paper-chapter-select"
        label="Chapter / Unit"
        value={selectedChapterId}
        onChange={(e) => handleChapterChange(e.target.value)}
        options={chapters.map((c) => ({ value: c.id, label: c.name }))}
        placeholder="Select Chapter"
        disabled={!selectedSubjectId}
        icon={<ClipboardList className="w-4 h-4 text-slate-400" />}
      />
    </div>
  );
};

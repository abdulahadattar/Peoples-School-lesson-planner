import React from 'react';
import SelectField from '../ui/SelectField';
import {
  ChevronDownIcon,
  SchoolIcon,
  UserIcon,
} from '../icons/MiscIcons';
import { SelectionApi } from '../../hooks/useSelection';
import { sectionsByClass, subjectNames } from '../../services/teacherRoster';

export interface TeacherMetadataPanelProps {
  selection: SelectionApi;
  isOpen: boolean;
  onToggle: () => void;
  inputClass: string;
}

export const TeacherMetadataPanel: React.FC<TeacherMetadataPanelProps> = ({
  selection,
  isOpen,
  onToggle,
  inputClass,
}) => {
  const {
    teacherId: selectedTeacherId,
    teacher: selectedTeacher,
    schoolName,
    teacherChoices,
    handleTeacherChange,
    setSchoolName,
  } = selection;

  return (
    <div className="border border-black/[0.06] dark:border-white/[0.08] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-brand-text-primary">
            Teacher & School Details
          </span>
          <span className="text-[10px] text-brand-text-secondary">
            {selectedTeacher ? `(${selectedTeacher.name})` : '(Optional)'}
          </span>
        </div>
        <ChevronDownIcon
          className={`w-4 h-4 text-brand-text-secondary transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="p-4 bg-white dark:bg-brand-surface border-t border-black/[0.06] dark:border-white/[0.08] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              id="teacher-select"
              label="Select Teacher"
              icon={<UserIcon className="w-3.5 h-3.5" />}
              value={selectedTeacherId}
              onChange={(e) => handleTeacherChange(e.target.value)}
            >
              <option value="">Choose a teacher (or leave empty)</option>
              {teacherChoices.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name} — {subjectNames(teacher).join(', ')}
                </option>
              ))}
            </SelectField>

            {selectedTeacher && (
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/10 rounded-xl">
                <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                  Assigned Sections
                </div>
                <div className="text-xs text-brand-text-secondary space-y-0.5">
                  {Object.entries(sectionsByClass(selectedTeacher)).map(([cls, sections]) => (
                    <div key={cls}>
                      <span className="font-semibold text-brand-text-primary">{cls}:</span>{' '}
                      {sections.join(', ')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="school-name-input"
              className="block text-[11px] font-semibold text-brand-text-secondary mb-2 uppercase tracking-wide"
            >
              School Name (Printed on Lesson Plan)
            </label>
            <div className="relative">
              <input
                id="school-name-input"
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. Peoples Higher Secondary School Jamshoro"
                className={inputClass}
              />
              <SchoolIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

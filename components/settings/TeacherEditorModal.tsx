import React, { useState, useEffect } from 'react';
import { Check, User, Briefcase, BookOpen, Plus, Trash2 } from 'lucide-react';
import { Teacher, TeacherSubject } from '../../types';
import { BaseModal } from '../ui/BaseModal';
import SelectField from '../ui/SelectField';
import {
  DEFAULT_SCHOOL_CONFIG,
  getCachedSchoolConfig,
  getSectionIdentifiers,
} from '../../services/schoolConfigService';

export interface TeacherEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (teacher: Teacher) => void;
  initialData?: Teacher | null;
  availableClasses?: string[];
  availableClassKeys?: string[];
  schoolName?: string;
}

const DEFAULT_FALLBACK_CLASSES = getSectionIdentifiers(DEFAULT_SCHOOL_CONFIG.classes);

export const TeacherEditorModal: React.FC<TeacherEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  availableClasses,
  availableClassKeys,
  schoolName,
}) => {
  const activeClassList =
    (availableClasses && availableClasses.length > 0 ? availableClasses : null) ||
    (availableClassKeys && availableClassKeys.length > 0 ? availableClassKeys : null) ||
    DEFAULT_FALLBACK_CLASSES;
  const resolvedSchoolName = schoolName || getCachedSchoolConfig().schoolName;
  const [name, setName] = useState(initialData?.name || '');
  const [designation, setDesignation] = useState(initialData?.designation || 'Subject Specialist');
  const [subjects, setSubjects] = useState<TeacherSubject[]>(
    initialData?.subjects || [{ name: 'English', sections: ['IX', 'X-A'] }]
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setDesignation(initialData?.designation || 'Subject Specialist');
      setSubjects(
        initialData?.subjects?.length
          ? JSON.parse(JSON.stringify(initialData.subjects))
          : [{ name: 'Mathematics', sections: ['VII', 'VIII'] }]
      );
      setError(null);
    }
  }, [isOpen, initialData]);

  const handleAddSubject = () => {
    setSubjects((prev) => [...prev, { name: '', sections: [] }]);
  };

  const handleRemoveSubject = (idx: number) => {
    setSubjects((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubjectNameChange = (idx: number, newName: string) => {
    setSubjects((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], name: newName };
      return copy;
    });
  };

  const handleToggleSection = (subIdx: number, section: string) => {
    setSubjects((prev) => {
      const copy = [...prev];
      const cur = copy[subIdx].sections || [];
      const updated = cur.includes(section) ? cur.filter((s) => s !== section) : [...cur, section];
      copy[subIdx] = { ...copy[subIdx], sections: updated };
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Teacher name is required.');
      return;
    }

    const filteredSubjects = subjects.filter((s) => s.name.trim() !== '');

    onSave({
      id: initialData?.id || `teacher-${Date.now()}`,
      name: name.trim(),
      designation: designation.trim(),
      schoolName: resolvedSchoolName,
      subjects: filteredSubjects,
    });
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? `Edit ${initialData.name}` : 'Add Faculty Member'}
      subtitle="Configure faculty profile, designation, and subject allocations"
      icon={
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <User className="w-5 h-5" />
        </div>
      }
      maxWidth="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 shadow-soft active:scale-95 transition-[color,background-color,border-color,transform] cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{initialData ? 'Update Teacher' : 'Save Teacher'}</span>
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Teacher Full Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sir Abdul Ahad, Miss Aneela, Ma'am Arsala"
            required
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <SelectField
          label="Designation / Role"
          icon={<Briefcase className="w-3.5 h-3.5" />}
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          options={[
            { value: 'Subject Specialist', label: 'Subject Specialist' },
            { value: 'Co-Ordinator', label: 'Co-Ordinator' },
            { value: 'Senior Teacher', label: 'Senior Teacher' },
            { value: 'Junior Teacher', label: 'Junior Teacher' },
            { value: 'Principal', label: 'Principal' },
            { value: 'Vice Principal', label: 'Vice Principal' },
            { value: 'Lab Incharge', label: 'Lab Incharge' },
            { value: 'Class In-charge', label: 'Class In-charge' },
          ]}
        />

        {/* Subjects and Classes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <span>Teaching Subjects & Assigned Classes</span>
            </span>
            <button
              type="button"
              onClick={handleAddSubject}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Subject</span>
            </button>
          </div>

          {subjects.map((sub, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={sub.name}
                  onChange={(e) => handleSubjectNameChange(idx, e.target.value)}
                  placeholder="Subject Name (e.g. Physics, Maths, English)"
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:border-primary"
                />
                {subjects.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSubject(idx)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    title="Remove subject"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Assigned Class Sections:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-1">
                  {activeClassList.map((cls) => {
                    const isAssigned = (sub.sections || []).includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => handleToggleSection(idx, cls)}
                        className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-[11px] font-semibold transition-[color,background-color,border-color,box-shadow] cursor-pointer ${
                          isAssigned
                            ? 'bg-primary text-white shadow-xs'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </form>
    </BaseModal>
  );
};

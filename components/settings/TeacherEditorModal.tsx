import React, { useState, useEffect } from 'react';
import { X, Check, User, Briefcase, BookOpen, Plus, Trash2 } from 'lucide-react';
import { Teacher, TeacherSubject } from '../../types';

interface TeacherEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (teacher: Teacher) => void;
  initialData?: Teacher | null;
  availableClasses: string[];
}

export const TeacherEditorModal: React.FC<TeacherEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  availableClasses,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [designation, setDesignation] = useState(initialData?.designation || 'Subject Specialist');
  const [schoolName] = useState('Peoples Higher Secondary School Jamshoro');
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

  if (!isOpen) return null;

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
      schoolName,
      subjects: filteredSubjects,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-brand-surface rounded-2xl border border-brand-border shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-brand-text-primary">
                {initialData ? `Edit ${initialData.name}` : 'Add Faculty Member'}
              </h3>
              <p className="text-xs text-brand-text-secondary">
                Configure faculty profile, designation, and subject allocations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors active:bg-brand-bg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-brand-text-secondary mb-1">
              Teacher Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sir Abdul Ahad, Miss Aneela, Ma'am Arsala"
              required
              className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-text-secondary mb-1 flex items-center justify-between">
              <span>Designation / Role</span>
              <Briefcase className="w-3.5 h-3.5 text-brand-text-secondary" />
            </label>
            <select
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-brand-panel border border-brand-border text-brand-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            >
              <option value="Subject Specialist">Subject Specialist</option>
              <option value="Co-Ordinator">Co-Ordinator</option>
              <option value="Senior Teacher">Senior Teacher</option>
              <option value="Junior Teacher">Junior Teacher</option>
              <option value="Principal">Principal</option>
              <option value="Vice Principal">Vice Principal</option>
              <option value="Lab Incharge">Lab Incharge</option>
              <option value="Class In-charge">Class In-charge</option>
            </select>
          </div>

          {/* Subjects and Classes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-text-primary flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-brand-primary" />
                <span>Teaching Subjects & Assigned Classes</span>
              </span>
              <button
                type="button"
                onClick={handleAddSubject}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Add Subject</span>
              </button>
            </div>

            {subjects.map((sub, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-brand-border/70 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={sub.name}
                    onChange={(e) => handleSubjectNameChange(idx, e.target.value)}
                    placeholder="Subject Name (e.g. Physics, Maths, English)"
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-brand-surface border border-brand-border text-brand-text-primary focus:outline-none focus:border-brand-primary"
                  />
                  {subjects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSubject(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      title="Remove subject"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-brand-text-secondary block mb-1">
                    Assigned Class Sections:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                    {availableClasses.map((cls) => {
                      const isAssigned = (sub.sections || []).includes(cls);
                      return (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => handleToggleSection(idx, cls)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${
                            isAssigned
                              ? 'bg-brand-primary text-white shadow-xs'
                              : 'bg-white dark:bg-brand-surface border border-brand-border text-brand-text-secondary hover:text-brand-text-primary'
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

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-brand-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:bg-brand-bg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{initialData ? 'Update Teacher' : 'Save Teacher'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

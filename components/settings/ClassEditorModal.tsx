import React, { useState } from 'react';
import { Check, BookOpen, User, Users } from 'lucide-react';
import { ClassTeacherConfig } from '../../services/schoolConfigService';
import { Teacher } from '../../types';
import { BaseModal } from '../ui/BaseModal';

interface ClassEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (classConfig: ClassTeacherConfig) => void;
  initialData?: ClassTeacherConfig | null;
  teachers: Teacher[];
}

export const ClassEditorModal: React.FC<ClassEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  teachers,
}) => {
  const [classKey, setClassKey] = useState(initialData?.classKey || '');
  const [romanName, setRomanName] = useState(initialData?.romanName || '');
  const [displayName, setDisplayName] = useState(initialData?.displayName || '');
  const [classTeacher, setClassTeacher] = useState(initialData?.classTeacher || '');
  const [enrolledBoys, setEnrolledBoys] = useState<number>(initialData?.enrolledBoys || 0);
  const [enrolledGirls, setEnrolledGirls] = useState<number>(initialData?.enrolledGirls || 0);
  const [subjectsStr, setSubjectsStr] = useState<string>(
    initialData?.subjects?.join(', ') || 'English, Urdu, Sindhi, Mathematics, Science, Islamiat, Social Studies'
  );
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setClassKey(initialData?.classKey || '');
      setRomanName(initialData?.romanName || '');
      setDisplayName(initialData?.displayName || '');
      setClassTeacher(initialData?.classTeacher || '');
      setEnrolledBoys(initialData?.enrolledBoys || 0);
      setEnrolledGirls(initialData?.enrolledGirls || 0);
      setSubjectsStr(
        initialData?.subjects?.join(', ') || 'English, Urdu, Sindhi, Mathematics, Science, Islamiat, Social Studies'
      );
      setError(null);
    }
  }, [isOpen, initialData, teachers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!classKey.trim()) {
      setError('Class identifier (key) is required.');
      return;
    }
    if (!romanName.trim()) {
      setError('Roman name / short code is required.');
      return;
    }

    const cleanSubjects = subjectsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    onSave({
      classKey: classKey.trim().toUpperCase().replace(/\s+/g, '-'),
      romanName: romanName.trim(),
      displayName: displayName.trim() || `Class ${romanName.trim()}`,
      classTeacher: classTeacher.trim() || 'Unassigned',
      enrolledBoys: Math.max(0, enrolledBoys),
      enrolledGirls: Math.max(0, enrolledGirls),
      totalEnrollment: Math.max(0, enrolledBoys) + Math.max(0, enrolledGirls),
      subjects: cleanSubjects,
    });
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? `Edit Class ${initialData.romanName}` : 'Add New Class Section'}
      subtitle="Configure grade name, in-charge teacher, and baseline enrollment"
      icon={
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <BookOpen className="w-5 h-5" />
        </div>
      }
      maxWidth="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 shadow-soft active:scale-95 transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{initialData ? 'Update Class' : 'Save Class'}</span>
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Class Key (ID) *
            </label>
            <input
              type="text"
              value={classKey}
              onChange={(e) => {
                setClassKey(e.target.value);
                if (!romanName) setRomanName(e.target.value);
                if (!displayName) setDisplayName(`Class ${e.target.value}`);
              }}
              placeholder="e.g. IX-Sci, VIA, ECCE"
              required
              className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Roman / Short Name *
            </label>
            <input
              type="text"
              value={romanName}
              onChange={(e) => setRomanName(e.target.value)}
              placeholder="e.g. IX-Sci, IV-A"
              required
              className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Class IX Science"
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
            <span>Class Teacher In-Charge</span>
            <User className="w-3.5 h-3.5 text-slate-400" />
          </label>
          <div className="relative">
            <input
              list="teachers-list"
              type="text"
              value={classTeacher}
              onChange={(e) => setClassTeacher(e.target.value)}
              placeholder="Select or enter teacher name..."
              className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <datalist id="teachers-list">
              {(teachers || []).map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Enrollments */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span>Enrolled Students</span>
            </span>
            <span className="text-xs font-mono font-extrabold text-primary">
              Total: {enrolledBoys + enrolledGirls}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-blue-600 dark:text-blue-400 mb-1">
                Enrolled Boys
              </label>
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min="0"
                value={enrolledBoys}
                onChange={(e) => setEnrolledBoys(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-rose-600 dark:text-rose-400 mb-1">
                Enrolled Girls
              </label>
              <input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min="0"
                value={enrolledGirls}
                onChange={(e) => setEnrolledGirls(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Curriculum Subjects (comma separated)
          </label>
          <textarea
            rows={2}
            value={subjectsStr}
            onChange={(e) => setSubjectsStr(e.target.value)}
            placeholder="Maths, Science, English, Urdu, Sindhi..."
            className="w-full px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>
      </form>
    </BaseModal>
  );
};

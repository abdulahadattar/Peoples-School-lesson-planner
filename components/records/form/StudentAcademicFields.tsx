import React from 'react';
import { StudentRecord } from '../../../services/googleSheetsService';

export const CLASS_OPTIONS = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'Kindergarten', 'Primary'];
export const STATUS_OPTIONS = ['Promoted', 'New Enrollment', 'DROP OUT', 'Active', 'Struck Off', 'Transferred'];
export const SECTION_OPTIONS = ['A', 'B', 'C', 'D'];

export interface StudentAcademicFieldsProps {
  formData: StudentRecord;
  onChange: (key: keyof StudentRecord, value: string) => void;
}

export const StudentAcademicFields: React.FC<StudentAcademicFieldsProps> = ({
  formData,
  onChange,
}) => {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-3">
        4. Class, Section & Status
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 text-xs">
        <div>
          <label className="block font-medium text-brand-text-primary mb-1">
            Current Class <span className="text-rose-500">*</span>
          </label>
          <select
            value={formData.currentClass}
            onChange={(e) => onChange('currentClass', e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Section</label>
          <select
            value={formData.section}
            onChange={(e) => onChange('section', e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
          >
            {SECTION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Class Admitted</label>
          <select
            value={formData.classAdmitted}
            onChange={(e) => onChange('classAdmitted', e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => onChange('status', e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary font-semibold"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Shift</label>
          <input
            type="text"
            value={formData.shift}
            onChange={(e) => onChange('shift', e.target.value)}
            placeholder="Morning"
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
          />
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Medium of Instruction</label>
          <input
            type="text"
            value={formData.medium}
            onChange={(e) => onChange('medium', e.target.value)}
            placeholder="English"
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
          />
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Picture</label>
          <select
            value={formData.picture}
            onChange={(e) => onChange('picture', e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </div>

        <div>
          <label className="block font-medium text-brand-text-primary mb-1">Admission Date (D/M/Y)</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={formData.admissionDay}
              onChange={(e) => onChange('admissionDay', e.target.value)}
              placeholder="DD"
              className="w-1/3 px-2 py-2 text-center rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
            <input
              type="text"
              value={formData.admissionMonth}
              onChange={(e) => onChange('admissionMonth', e.target.value)}
              placeholder="MM"
              className="w-1/3 px-2 py-2 text-center rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
            <input
              type="text"
              value={formData.admissionYear}
              onChange={(e) => onChange('admissionYear', e.target.value)}
              placeholder="YYYY"
              className="w-1/3 px-2 py-2 text-center rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { StudentRecord } from '../../../services/googleSheetsService';
import SelectField from '../../ui/SelectField';

export const CLASS_OPTIONS = ['ECE', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'Kindergarten', 'Primary'];
export const STATUS_OPTIONS = ['New Enrollment', 'Promoted', 'DROP OUT'];
export const SECTION_OPTIONS = ['A', 'B', 'C', 'D'];

function toOptionsWithCurrent(base: string[], current?: string) {
  const list = [...base];
  if (current && !list.includes(current)) {
    list.unshift(current);
  }
  return list.map((item) => ({ value: item, label: item }));
}

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
        <SelectField
          label="Current Class"
          required
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={formData.currentClass}
          onChange={(e) => onChange('currentClass', e.target.value)}
          options={toOptionsWithCurrent(CLASS_OPTIONS, formData.currentClass)}
        />

        <SelectField
          label="Section"
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={formData.section}
          onChange={(e) => onChange('section', e.target.value)}
          options={toOptionsWithCurrent(SECTION_OPTIONS, formData.section)}
        />

        <SelectField
          label="Class Admitted"
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={formData.classAdmitted}
          onChange={(e) => onChange('classAdmitted', e.target.value)}
          options={toOptionsWithCurrent(CLASS_OPTIONS, formData.classAdmitted)}
        />

        <SelectField
          label="Status"
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={formData.status}
          onChange={(e) => onChange('status', e.target.value)}
          options={STATUS_OPTIONS.map((item) => ({ value: item, label: item }))}
        />

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

        <SelectField
          label="Picture"
          size="sm"
          dropdownWidth="match"
          searchable={false}
          value={formData.picture}
          onChange={(e) => onChange('picture', e.target.value)}
          options={[
            { value: 'YES', label: 'YES' },
            { value: 'NO', label: 'NO' },
          ]}
        />

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

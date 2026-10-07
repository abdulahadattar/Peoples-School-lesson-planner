import React from 'react';
import { StudentRecord } from '../../services/googleSheetsService';
import {
  StudentIdentityFields,
  GENDER_OPTIONS,
} from './form/StudentIdentityFields';
import {
  StudentAcademicFields,
  CLASS_OPTIONS,
  STATUS_OPTIONS,
  SECTION_OPTIONS,
} from './form/StudentAcademicFields';

export { CLASS_OPTIONS, STATUS_OPTIONS, GENDER_OPTIONS, SECTION_OPTIONS };

export interface StudentEditFormFieldsProps {
  formData: StudentRecord;
  formErrors: { [key: string]: string };
  onChange: (key: keyof StudentRecord, value: string) => void;
}

export const StudentEditFormFields: React.FC<StudentEditFormFieldsProps> = ({
  formData,
  formErrors,
  onChange,
}) => {
  return (
    <div className="space-y-6 py-1">
      <StudentIdentityFields
        formData={formData}
        formErrors={formErrors}
        onChange={onChange}
      />

      {/* Section 3: Parent & Contact Details */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-3">
          3. Parent / Guardian & Contacts
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
          <div className="sm:col-span-2">
            <label className="block font-medium text-brand-text-primary mb-1">
              Father / Guardian Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.fatherName}
              onChange={(e) => onChange('fatherName', e.target.value)}
              placeholder="e.g. Abdul Waheed"
              className={`w-full px-3 py-2 rounded-xl bg-brand-bg border ${
                formErrors.fatherName ? 'border-rose-500' : 'border-brand-border'
              } focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary`}
            />
            {formErrors.fatherName && <p className="text-[10px] text-rose-500 mt-1">{formErrors.fatherName}</p>}
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Parent CNIC No.</label>
            <input
              type="text"
              value={formData.parentCnic}
              onChange={(e) => onChange('parentCnic', e.target.value)}
              placeholder="41205-XXXXXXX-X"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Parent / Guardian Contact</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formData.parentContact}
              onChange={(e) => onChange('parentContact', e.target.value)}
              placeholder="03XX-XXXXXXX"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Emergency Contact</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formData.emergencyContact}
              onChange={(e) => onChange('emergencyContact', e.target.value)}
              placeholder="03XX-XXXXXXX"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Partner Contact Number</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formData.partnerContact}
              onChange={(e) => onChange('partnerContact', e.target.value)}
              placeholder="0333-5699357"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block font-medium text-brand-text-primary mb-1">Residential Address</label>
            <textarea
              rows={2}
              value={formData.address}
              onChange={(e) => onChange('address', e.target.value)}
              placeholder="e.g. Phase 1 Sindh University Employees Housing Society Jamshoro"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary resize-none"
            />
          </div>
        </div>
      </div>

      <StudentAcademicFields
        formData={formData}
        onChange={onChange}
      />
    </div>
  );
};

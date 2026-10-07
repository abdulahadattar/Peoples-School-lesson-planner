import React from 'react';
import { StudentRecord } from '../../../services/googleSheetsService';

export const GENDER_OPTIONS = ['Male', 'Female'];

export interface StudentIdentityFieldsProps {
  formData: StudentRecord;
  formErrors: { [key: string]: string };
  onChange: (key: keyof StudentRecord, value: string) => void;
}

export const StudentIdentityFields: React.FC<StudentIdentityFieldsProps> = ({
  formData,
  formErrors,
  onChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Section 1: Basic Identity */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-3">
          1. Student Identity & Admission
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
          <div>
            <label className="block font-medium text-brand-text-primary mb-1">
              GR# <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.grNo}
              onChange={(e) => onChange('grNo', e.target.value)}
              placeholder="e.g. 1355"
              className={`w-full px-3 py-2 rounded-xl bg-brand-bg border ${
                formErrors.grNo ? 'border-rose-500' : 'border-brand-border'
              } focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary`}
            />
            {formErrors.grNo && <p className="text-[10px] text-rose-500 mt-1">{formErrors.grNo}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block font-medium text-brand-text-primary mb-1">
              Name of Student <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.studentName}
              onChange={(e) => onChange('studentName', e.target.value)}
              placeholder="e.g. Muhammad Ali"
              className={`w-full px-3 py-2 rounded-xl bg-brand-bg border ${
                formErrors.studentName ? 'border-rose-500' : 'border-brand-border'
              } focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary`}
            />
            {formErrors.studentName && <p className="text-[10px] text-rose-500 mt-1">{formErrors.studentName}</p>}
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">B.Form No.</label>
            <input
              type="text"
              value={formData.bFormNo}
              onChange={(e) => onChange('bFormNo', e.target.value)}
              placeholder="41205-XXXXXXX-X"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => onChange('gender', e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            >
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Religion</label>
            <input
              type="text"
              value={formData.religion}
              onChange={(e) => onChange('religion', e.target.value)}
              placeholder="Islam"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Date of Birth */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-3">
          2. Date of Birth (DD / MM / YYYY)
        </h3>
        <div className="grid grid-cols-3 gap-3.5 text-xs max-w-md">
          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Day (DD)</label>
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="1"
              max="31"
              value={formData.dobDay}
              onChange={(e) => onChange('dobDay', e.target.value)}
              placeholder="25"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>
          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Month (MM)</label>
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="1"
              max="12"
              value={formData.dobMonth}
              onChange={(e) => onChange('dobMonth', e.target.value)}
              placeholder="10"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>
          <div>
            <label className="block font-medium text-brand-text-primary mb-1">Year (YYYY)</label>
            <input
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min="1990"
              max="2030"
              value={formData.dobYear}
              onChange={(e) => onChange('dobYear', e.target.value)}
              placeholder="2009"
              className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

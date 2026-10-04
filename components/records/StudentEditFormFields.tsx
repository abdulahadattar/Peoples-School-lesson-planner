import React from 'react';
import { StudentRecord } from '../../services/googleSheetsService';

export const CLASS_OPTIONS = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'Kindergarten', 'Primary'];
export const STATUS_OPTIONS = ['Promoted', 'New Enrollment', 'DROP OUT', 'Active', 'Struck Off', 'Transferred'];
export const GENDER_OPTIONS = ['Male', 'Female'];
export const SECTION_OPTIONS = ['A', 'B', 'C', 'D'];

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

      {/* Section 4: Academic Enrollment */}
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
    </div>
  );
};

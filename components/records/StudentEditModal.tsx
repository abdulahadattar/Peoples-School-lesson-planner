import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { StudentRecord, VISIBLE_COLUMNS } from '../../services/googleSheetsService';
import { DiffItem } from './ConfirmationModal';

interface StudentEditModalProps {
  isOpen: boolean;
  student: StudentRecord | null;
  isAddMode?: boolean;
  onClose: () => void;
  onRequestConfirm: (updatedRecord: StudentRecord, diffs: DiffItem[], isAdd: boolean) => void;
}

const EMPTY_RECORD: Omit<StudentRecord, 'rowNumber'> = {
  rawMetadata: [],
  grNo: '',
  studentName: '',
  bFormNo: '',
  fatherName: '',
  gender: 'Male',
  dobDay: '',
  dobMonth: '',
  dobYear: '',
  classAdmitted: 'VI',
  currentClass: 'VI',
  parentCnic: '',
  religion: 'Islam',
  address: '',
  parentContact: '',
  emergencyContact: '',
  admissionDay: '1',
  admissionMonth: '8',
  admissionYear: '2026',
  section: 'A',
  partnerContact: '0333-5699357',
  shift: 'Morning',
  medium: 'English',
  picture: 'YES',
  status: 'Promoted',
};

const CLASS_OPTIONS = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'Kindergarten', 'Primary'];
const STATUS_OPTIONS = ['Promoted', 'New Enrollment', 'DROP OUT', 'Active', 'Struck Off', 'Transferred'];
const GENDER_OPTIONS = ['Male', 'Female'];
const SECTION_OPTIONS = ['A', 'B', 'C', 'D'];

export const StudentEditModal: React.FC<StudentEditModalProps> = ({
  isOpen,
  student,
  isAddMode = false,
  onClose,
  onRequestConfirm,
}) => {
  const [formData, setFormData] = useState<StudentRecord>({
    ...EMPTY_RECORD,
    rowNumber: 0,
  });
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (student && !isAddMode) {
      setFormData({ ...student });
    } else {
      setFormData({
        ...EMPTY_RECORD,
        rowNumber: 0,
      });
    }
    setFormErrors({});
  }, [student, isAddMode, isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: keyof StudentRecord, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
    if (formErrors[key]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};
    if (!formData.grNo.trim()) errors.grNo = 'GR# is required';
    if (!formData.studentName.trim()) errors.studentName = 'Student name is required';
    if (!formData.fatherName.trim()) errors.fatherName = 'Father name is required';
    if (!formData.currentClass.trim()) errors.currentClass = 'Current class is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const diffs: DiffItem[] = [];

    if (isAddMode) {
      VISIBLE_COLUMNS.forEach((col) => {
        const key = col.key as keyof StudentRecord;
        const val = (formData[key] as string) || '';
        if (val) {
          diffs.push({
            field: String(key),
            label: col.label,
            oldValue: '',
            newValue: val,
          });
        }
      });
    } else if (student) {
      VISIBLE_COLUMNS.forEach((col) => {
        const key = col.key as keyof StudentRecord;
        const oldVal = (student[key] as string) || '';
        const newVal = (formData[key] as string) || '';
        if (oldVal !== newVal) {
          diffs.push({
            field: String(key),
            label: col.label,
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      });
    }

    onRequestConfirm(formData, diffs, isAddMode);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-brand-surface border border-brand-border shadow-card p-6 flex flex-col max-h-[92vh] my-auto">
        <div className="flex items-center justify-between pb-4 border-b border-brand-border">
          <div>
            <h2 className="text-lg font-bold text-brand-text-primary tracking-tight">
              {isAddMode ? 'Add New Student to Google Sheet' : `Edit Student Record: ${formData.studentName || 'Student'}`}
            </h2>
            <p className="text-xs text-brand-text-secondary mt-0.5">
              {isAddMode
                ? 'Fill the visible school record details to append a new entry to the spreadsheet.'
                : `Updating row #${formData.rowNumber} in sheet "Jamshoro South Final SPD (2)".`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-6">
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
                  onChange={(e) => handleChange('grNo', e.target.value)}
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
                  onChange={(e) => handleChange('studentName', e.target.value)}
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
                  onChange={(e) => handleChange('bFormNo', e.target.value)}
                  placeholder="41205-XXXXXXX-X"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
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
                  onChange={(e) => handleChange('religion', e.target.value)}
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
                  min="1"
                  max="31"
                  value={formData.dobDay}
                  onChange={(e) => handleChange('dobDay', e.target.value)}
                  placeholder="25"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>
              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Month (MM)</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={formData.dobMonth}
                  onChange={(e) => handleChange('dobMonth', e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>
              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Year (YYYY)</label>
                <input
                  type="number"
                  min="1990"
                  max="2030"
                  value={formData.dobYear}
                  onChange={(e) => handleChange('dobYear', e.target.value)}
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
                  onChange={(e) => handleChange('fatherName', e.target.value)}
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
                  onChange={(e) => handleChange('parentCnic', e.target.value)}
                  placeholder="41205-XXXXXXX-X"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Parent / Guardian Contact</label>
                <input
                  type="text"
                  value={formData.parentContact}
                  onChange={(e) => handleChange('parentContact', e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Emergency Contact</label>
                <input
                  type="text"
                  value={formData.emergencyContact}
                  onChange={(e) => handleChange('emergencyContact', e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Partner Contact Number</label>
                <input
                  type="text"
                  value={formData.partnerContact}
                  onChange={(e) => handleChange('partnerContact', e.target.value)}
                  placeholder="0333-5699357"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block font-medium text-brand-text-primary mb-1">Residential Address</label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
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
                  onChange={(e) => handleChange('currentClass', e.target.value)}
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
                  onChange={(e) => handleChange('section', e.target.value)}
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
                  onChange={(e) => handleChange('classAdmitted', e.target.value)}
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
                  onChange={(e) => handleChange('status', e.target.value)}
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
                  onChange={(e) => handleChange('shift', e.target.value)}
                  placeholder="Morning"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Medium of Instruction</label>
                <input
                  type="text"
                  value={formData.medium}
                  onChange={(e) => handleChange('medium', e.target.value)}
                  placeholder="English"
                  className="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-brand-text-primary mb-1">Picture</label>
                <select
                  value={formData.picture}
                  onChange={(e) => handleChange('picture', e.target.value)}
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
                    onChange={(e) => handleChange('admissionDay', e.target.value)}
                    placeholder="DD"
                    className="w-1/3 px-2 py-2 text-center rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                  />
                  <input
                    type="text"
                    value={formData.admissionMonth}
                    onChange={(e) => handleChange('admissionMonth', e.target.value)}
                    placeholder="MM"
                    className="w-1/3 px-2 py-2 text-center rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                  />
                  <input
                    type="text"
                    value={formData.admissionYear}
                    onChange={(e) => handleChange('admissionYear', e.target.value)}
                    placeholder="YYYY"
                    className="w-1/3 px-2 py-2 text-center rounded-xl bg-brand-bg border border-brand-border focus:outline-hidden focus:ring-1 focus:ring-brand-primary text-brand-text-primary"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between pt-4 border-t border-brand-border mt-auto">
          <p className="text-[11px] text-brand-text-secondary flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-brand-primary" />
            <span>You will be prompted to confirm all changes before pushing to Google Sheet.</span>
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg border border-brand-border transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 shadow-soft active:scale-95 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Review & Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

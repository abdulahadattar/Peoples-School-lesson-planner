import React, { useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { StudentRecord, VISIBLE_COLUMNS } from '../../services/googleSheetsService';
import { DiffItem } from './ConfirmationModal';
import { BaseModal } from '../ui/BaseModal';
import { StudentEditFormFields } from './StudentEditFormFields';

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
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={isAddMode ? 'Add New Student to Google Sheet' : `Edit Student Record: ${formData.studentName || 'Student'}`}
      subtitle={
        isAddMode
          ? 'Fill the visible school record details to append a new entry to the spreadsheet.'
          : `Updating row #${formData.rowNumber} in sheet "Jamshoro South Final SPD (2)".`
      }
      footer={
        <div className="w-full flex items-center justify-between">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-primary" />
            <span>You will be prompted to confirm all changes before pushing to Google Sheet.</span>
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 shadow-soft active:scale-95 transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Review & Save</span>
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSave}>
        <StudentEditFormFields
          formData={formData}
          formErrors={formErrors}
          onChange={handleChange}
        />
      </form>
    </BaseModal>
  );
};

export default StudentEditModal;

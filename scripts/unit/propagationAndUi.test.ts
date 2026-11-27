import React from 'react';
import teachersJson from '../../data/teachers.json';
import { mergeCurriculums } from '../../curriculum';
import { extractOptionsFromChildren } from '../../components/ui/select/selectHelpers';
import { DEFAULT_GRADE_ENROLLMENTS } from '../../services/attendance/types';
import { DEFAULT_MARKSHEET_CONFIG } from '../../services/marksheet/config';
import { DEFAULT_SCHOOL_CONFIG } from '../../services/schoolConfig/defaults';
import {
  applySchoolConfigToMarksheetConfig,
  enrollmentsFromSchoolConfig,
  syncSchoolConfigEnrollments,
} from '../../services/schoolConfig/propagation';
import {
  autoSelectForTeacher,
  classesForTeacher,
  subjectsForTeacher,
} from '../../services/teacherRoster';
import type { CurriculumClass, Teacher } from '../../types';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

export async function runPropagationAndUiTests(h: Harness) {
  const { describe, it, eq } = h;

  describe('SelectField.extractOptionsFromChildren (<optgroup> & Fragment support)');
  it('preserves optgroup headers and parses option labels/sublabels', () => {
    const children = [
      React.createElement('option', { key: 'empty', value: '' }, 'Unassigned'),
      React.createElement(
        'optgroup',
        { key: 'g1', label: 'Qualified Faculty' },
        React.createElement('option', { key: 't1', value: 'Sir Abdul Ahad' }, 'Sir Abdul Ahad — Physics'),
      ),
      React.createElement(
        React.Fragment,
        { key: 'frag' },
        React.createElement(
          'optgroup',
          { key: 'g2', label: 'Other Faculty' },
          React.createElement('option', { key: 't2', value: 'Sir Bahadur' }, 'Sir Bahadur (Mathematics)'),
        ),
      ),
    ];

    const items = extractOptionsFromChildren(children);
    eq(items.length, 3);
    eq(items[0].value, '');
    eq(items[0].group, undefined);
    eq(items[1].value, 'Sir Abdul Ahad');
    eq(items[1].label, 'Sir Abdul Ahad');
    eq(items[1].sublabel, 'Physics');
    eq(items[1].group, 'Qualified Faculty');
    eq(items[2].value, 'Sir Bahadur');
    eq(items[2].label, 'Sir Bahadur');
    eq(items[2].badge, 'Mathematics');
    eq(items[2].group, 'Other Faculty');
  });

  describe('schoolConfig.propagation (Admin -> Attendance & Marksheets)');
  it('propagates updated Admin class counts to Attendance and back without losing other fields', () => {
    const updatedClasses = DEFAULT_SCHOOL_CONFIG.classes.map((c) =>
      c.classKey === 'IX'
        ? { ...c, enrolledBoys: 52, enrolledGirls: 41, totalEnrollment: 93 }
        : c
    );

    const enrollments = enrollmentsFromSchoolConfig(updatedClasses, DEFAULT_GRADE_ENROLLMENTS);
    const ix = enrollments.find((e) => e.classKey === 'IX');
    eq(ix?.enrolledBoys, 52);
    eq(ix?.enrolledGirls, 41);
    eq(ix?.totalEnrollment, 93);

    const roundTripped = syncSchoolConfigEnrollments(
      DEFAULT_SCHOOL_CONFIG.classes,
      enrollments.map((e) =>
        e.classKey === 'X' ? { ...e, enrolledBoys: 30, enrolledGirls: 20, totalEnrollment: 50 } : e
      )
    );
    const xClass = roundTripped.find((c) => c.classKey === 'X');
    eq(xClass?.enrolledBoys, 30);
    eq(xClass?.enrolledGirls, 20);
    eq(xClass?.totalEnrollment, 50);
    eq(xClass?.classTeacher, DEFAULT_SCHOOL_CONFIG.classes.find((c) => c.classKey === 'X')?.classTeacher);
  });

  it('propagates customized institutional identity & Grade IX-XII class teachers to MarksheetConfig while preserving sheet baseline when untouched', () => {
    const untouched = applySchoolConfigToMarksheetConfig(
      DEFAULT_MARKSHEET_CONFIG,
      DEFAULT_SCHOOL_CONFIG
    );
    eq(untouched.academicYear, DEFAULT_MARKSHEET_CONFIG.academicYear);
    eq(untouched.principalName, DEFAULT_MARKSHEET_CONFIG.principalName);

    const customizedConfig = {
      ...DEFAULT_SCHOOL_CONFIG,
      schoolName: 'PHSSJ Demo Campus',
      academicSession: '2027-2028',
      principalName: 'Dr. Ayesha Khan',
      classes: DEFAULT_SCHOOL_CONFIG.classes.map((c) =>
        c.classKey === 'IX' ? { ...c, classTeacher: 'Sir Kamran Ali' } : c
      ),
    };

    const propagated = applySchoolConfigToMarksheetConfig(DEFAULT_MARKSHEET_CONFIG, customizedConfig);
    eq(propagated.schoolName, 'PHSSJ Demo Campus');
    eq(propagated.academicYear, '2027-2028');
    eq(propagated.principalName, 'Dr. Ayesha Khan');
    eq(propagated.classTeachers.IX, 'Sir Kamran Ali');
    eq(propagated.classTeachers.X, DEFAULT_MARKSHEET_CONFIG.classTeachers.X);
  });

  describe('Paper & Lesson selector cascade for real Physics faculty (Sir Abdul Ahad)');
  it('resolves classes IX-XII, auto-selects Physics, and preserves Physics chapters', () => {
    const teachers = (teachersJson as { teachers: Teacher[] }).teachers;
    const classes = mergeCurriculums() as unknown as CurriculumClass[];
    const ahad = teachers.find((t) => t.name.toLowerCase().includes('abdul ahad'));
    eq(Boolean(ahad), true, 'Sir Abdul Ahad must exist in teachers roster');
    if (!ahad) return;

    const availClasses = classesForTeacher(classes, ahad);
    eq(availClasses.some((c) => c.id === 'class9'), true);
    eq(availClasses.some((c) => c.id === 'class10'), true);
    eq(availClasses.some((c) => c.id === 'class11'), true);
    eq(availClasses.some((c) => c.id === 'class12'), true);

    const auto = autoSelectForTeacher(ahad, classes, 'class9');
    eq(auto.classId, 'class9');
    eq(auto.subjectId, 'physics');

    const subjectsIn9 = subjectsForTeacher(classes, 'class9', ahad);
    eq(subjectsIn9.length, 1);
    eq(subjectsIn9[0].id, 'physics');
    eq((subjectsIn9[0].chapters || []).length > 0, true, 'Physics IX must have chapters');
  });
}

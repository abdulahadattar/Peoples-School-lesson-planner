import assert from 'node:assert/strict';
import test from 'node:test';
import rawTimetable from '../data/timetable.json' with { type: 'json' };
import { syncClassesWithConfig } from '../components/live/liveTimetableSync.ts';
import { getClassTier } from '../services/tierHelpers.ts';
import { DEFAULT_SCHOOL_CONFIG } from '../services/schoolConfig/defaults.ts';
import { DEFAULT_GRADE_ENROLLMENTS } from '../services/attendance/types.ts';
import { buildAttendanceRows, calculateSchoolSummary } from '../services/attendance/calculations.ts';
import { normalizeGrKey } from '../services/identityNormalization.ts';

test('getClassTier classifies ECE and ECCE as primary', () => {
  assert.equal(getClassTier('ECE'), 'primary');
  assert.equal(getClassTier('ECCE'), 'primary');
  assert.equal(getClassTier('I-A'), 'primary');
  assert.equal(getClassTier('IV-B'), 'primary');
  assert.equal(getClassTier('V'), 'elementary');
  assert.equal(getClassTier('VI-A'), 'middle');
  assert.equal(getClassTier('IX'), 'secondary');
});

test('syncClassesWithConfig does not spawn phantom IV, VI, X duplicate parent cards', () => {
  const synced = syncClassesWithConfig(rawTimetable, DEFAULT_SCHOOL_CONFIG);
  const labels = synced.map((c) => c.label);

  assert.equal(labels.includes('IV'), false, 'Should not synthesize duplicate IV alongside IV-A/IV-B');
  assert.equal(labels.includes('VI'), false, 'Should not synthesize duplicate VI alongside VI-A/VI-B');
  assert.equal(labels.includes('X'), false, 'Should not synthesize duplicate X alongside X-A/X-B');

  assert.ok(labels.includes('IV-A'));
  assert.ok(labels.includes('IV-B'));
  assert.ok(labels.includes('VI-A'));
  assert.ok(labels.includes('VI-B'));
  assert.ok(labels.includes('X-A'));
  assert.ok(labels.includes('X-B'));
  assert.ok(labels.includes('ECE'));
  assert.equal(synced.length, 16);

  const ivB = synced.find((c) => c.label === 'IV-B');
  assert.equal(ivB?.classTeacher, 'Miss Fatima Qureshi');
});

test('DEFAULT_GRADE_ENROLLMENTS and schoolConfig classes share 868 total enrollment', () => {
  const attendanceTotal = calculateSchoolSummary(
    '2026-09-10',
    buildAttendanceRows(DEFAULT_GRADE_ENROLLMENTS, {})
  ).totalEnrolled;

  const settingsTotal = DEFAULT_SCHOOL_CONFIG.classes.reduce((sum, c) => {
    const b = c.enrolledBoys || 0;
    const g = c.enrolledGirls || 0;
    return sum + (c.totalEnrollment && c.totalEnrollment > 0 ? c.totalEnrollment : b + g);
  }, 0);

  assert.equal(attendanceTotal, 868);
  assert.equal(settingsTotal, 868);
});

test('normalizeGrKey reconciles leading zeros between OMR scan and Marksheets', () => {
  assert.equal(normalizeGrKey('0145'), '145');
  assert.equal(normalizeGrKey('145'), '145');
  assert.equal(normalizeGrKey('0098'), '98');
});

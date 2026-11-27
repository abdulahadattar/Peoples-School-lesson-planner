import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeAttendanceHistoryEntries,
  pickNewerAttendanceRecord,
} from '../../services/attendance/calculations';
import type {
  AttendanceHistoryEntry,
  DailyAttendanceRecord,
} from '../../services/attendance/types';
import { sanitizeExtractedStudentInfo } from '../../services/documentArchive/extractionSanitizer';

function makeRecord(overrides: Partial<DailyAttendanceRecord>): DailyAttendanceRecord {
  return {
    date: '2026-04-10',
    classes: {
      Nursery: { presentBoys: 10, presentGirls: 12 },
    },
    recordedBy: 'Admin',
    notes: '',
    updatedAt: 1000,
    ...overrides,
  };
}

test('pickNewerAttendanceRecord resolves conflicts by updatedAt while preserving max syncedToSheetAt', () => {
  assert.equal(pickNewerAttendanceRecord(null, null), null);

  const cloudOnly = makeRecord({ updatedAt: 2000 });
  assert.deepEqual(pickNewerAttendanceRecord(cloudOnly, null), cloudOnly);

  const localOnly = makeRecord({ updatedAt: 3000 });
  assert.deepEqual(pickNewerAttendanceRecord(null, localOnly), localOnly);

  const staleCloudSynced = makeRecord({
    updatedAt: 1000,
    syncedToSheetAt: 1500,
    classes: { Nursery: { presentBoys: 5, presentGirls: 5 } },
  });
  const newerLocalUnsynced = makeRecord({
    updatedAt: 5000,
    syncedToSheetAt: undefined,
    classes: { Nursery: { presentBoys: 18, presentGirls: 19 } },
  });

  const winnerLocal = pickNewerAttendanceRecord(staleCloudSynced, newerLocalUnsynced);
  assert.equal(winnerLocal?.classes.Nursery.presentBoys, 18);
  assert.equal(winnerLocal?.updatedAt, 5000);
  assert.equal(winnerLocal?.syncedToSheetAt, 1500);

  const newerCloud = makeRecord({
    updatedAt: 8000,
    classes: { Nursery: { presentBoys: 20, presentGirls: 21 } },
  });
  const staleLocalWithSync = makeRecord({
    updatedAt: 3000,
    syncedToSheetAt: 4000,
    classes: { Nursery: { presentBoys: 9, presentGirls: 9 } },
  });

  const winnerCloud = pickNewerAttendanceRecord(newerCloud, staleLocalWithSync);
  assert.equal(winnerCloud?.classes.Nursery.presentBoys, 20);
  assert.equal(winnerCloud?.syncedToSheetAt, 4000);
});

test('mergeAttendanceHistoryEntries keeps newer timestamps per date and sorts descending', () => {
  const cloud: AttendanceHistoryEntry[] = [
    { date: '2026-04-08', totalPresent: 100, percentage: 75, syncedToSheetAt: 1100, updatedAt: 1000 },
    { date: '2026-04-10', totalPresent: 120, percentage: 80, updatedAt: 4000 },
  ];
  const local: AttendanceHistoryEntry[] = [
    { date: '2026-04-08', totalPresent: 115, percentage: 82, updatedAt: 2500 },
    { date: '2026-04-09', totalPresent: 130, percentage: 88, syncedToSheetAt: 2200, updatedAt: 2100 },
  ];

  const merged = mergeAttendanceHistoryEntries(cloud, local);
  assert.deepEqual(
    merged.map((m) => m.date),
    ['2026-04-10', '2026-04-09', '2026-04-08']
  );

  const apr8 = merged.find((m) => m.date === '2026-04-08');
  assert.equal(apr8?.totalPresent, 115);
  assert.equal(apr8?.updatedAt, 2500);
  assert.equal(apr8?.syncedToSheetAt, 1100);
});

test('sanitizeExtractedStudentInfo strips boilerplate, validates scripts/CNICs, and normalizes children', () => {
  const rejected: Array<{ field: string; reason: string; raw: string }> = [];
  const clean = sanitizeExtractedStudentInfo(
    {
      grNo: ' 42 ',
      studentNameEnglish: 'GOVERNMENT OF SINDH',
      studentNameUrdu: 'احمد علی',
      studentNameSindhi: 'احمد علي',
      fatherNameEnglish: 'niaz ali memon',
      fatherNameUrdu: 'garbage English text',
      cardholderNameEnglish: 'family registration certificate',
      bFormNo: '41504-1234567-1',
      fatherCnic: '41504 7654321 9',
      gender: 'Female',
      children: [
        {
          entryNo: 1,
          childNameEnglish: 'sana memon',
          childNameUrdu: 'ثنا میمن',
          childNameSindhi: 'ثنا ميمڻ',
          fatherNameEnglish: 'niaz ali',
          bFormNo: '4150412345672',
          gender: 'Female',
        },
        {
          // Empty boilerplate child should be dropped
          childNameEnglish: 'CHILD REGISTRATION CERTIFICATE',
        },
      ],
    },
    'UNASSIGNED',
    (field, reason, raw) => rejected.push({ field, reason, raw })
  );

  assert.equal(clean.grNo, '42');
  assert.equal(clean.studentName, undefined);
  assert.equal(clean.studentNameUrdu, 'احمد علی');
  assert.equal(clean.studentNameSindhi, 'احمد علي');
  assert.equal(clean.fatherName, 'Niaz Ali Memon');
  assert.equal(clean.fatherNameUrdu, undefined);
  assert.equal(clean.cardholderName, undefined);
  assert.equal(clean.bFormNo, '41504-1234567-1');
  assert.equal(clean.fatherCnic, '41504-7654321-9');
  assert.equal(clean.gender, 'Female');
  assert.equal(clean.children?.length, 1);
  assert.equal(clean.children?.[0]?.childNameEnglish, 'Sana Memon');
  assert.equal(clean.children?.[0]?.childNameUrdu, 'ثنا میمن');
  assert.equal(clean.children?.[0]?.childNameSindhi, 'ثنا ميمڻ');
  assert.equal(clean.children?.[0]?.bFormNo, '41504-1234567-2');
  assert.ok(rejected.some((r) => r.field === 'studentName'));
  assert.ok(rejected.some((r) => r.field === 'fatherNameUrdu'));
  assert.ok(rejected.some((r) => r.field === 'cardholderName'));
});

test('ADMIN_EMAILS identifies abdul7762ahad@gmail.com as primary admin', async () => {
  const { ADMIN_EMAILS, isUserAdmin } = await import('../../services/adminService');
  assert.equal(ADMIN_EMAILS[0], 'abdul7762ahad@gmail.com');
  assert.equal(isUserAdmin('abdul7762ahad@gmail.com'), true);
  assert.equal(isUserAdmin('ABDUL7762AHAD@GMAIL.COM'), true);
  assert.equal(isUserAdmin({ email: 'abdul7762ahad@gmail.com' } as any), true);
  assert.equal(isUserAdmin('random@example.com'), false);
});

test('Firebase applet config contains valid OAuth client ID matching user specifications', async () => {
  const firebaseConfig = (await import('../../firebase-applet-config.json')).default;
  assert.equal(firebaseConfig.projectId, 'phssjportal');
  assert.equal(
    firebaseConfig.oAuthClientId,
    '752785162701-igum5tv22cv45k4afbh2an3unkul5b0s.apps.googleusercontent.com'
  );
  assert.equal(firebaseConfig.authDomain, 'phssjportal.firebaseapp.com');
});


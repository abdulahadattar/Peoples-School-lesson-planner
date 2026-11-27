import assert from 'node:assert/strict';
import {
  commitOmrScanToMarksheet,
  mapSubjectToMarksheetKey,
} from '../../services/omr/marksheetBridge';
import { OmrScanResult } from '../../services/omr/types';
import {
  loadMarksheetEntries,
  makeMarkEntryKey,
  mergeMarksheetEntries,
} from '../../services/marksheet/storage';
import { clearAllPendingSync, listPendingSync } from '../../services/sheetSyncQueue';
import type { StudentRecord } from '../../services/sheets/types';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const prev = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  return () => {
    if (prev === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = prev;
  };
}

export async function runOmrMarksheetBridgeTests(h: Harness) {
  const { describe, it, eq } = h;

  const makeScanResult = (over: Partial<OmrScanResult> = {}): OmrScanResult => ({
    grNumber: '01042',
    rawAnswers: ['A', 'B', 'C', 'D', 'A'],
    score: 18,
    total: 20,
    correctCount: 18,
    wrongCount: 2,
    blankCount: 0,
    multiCount: 0,
    confidenceMap: [0.95, 0.95, 0.95, 0.95, 0.95],
    flaggedQuestions: [],
    qrPayload: {
      v: 1,
      pid: 'paper_bridge_1',
      cls: 'IX',
      sub: 'Physics',
      n: 20,
      key: 'ABCDABCDABCDABCDABCD',
      ex: 'midterm',
    },
    fiducialsDetected: true,
    bubbleDetections: [],
    ...over,
  });

  describe('omr.marksheetBridge.mapSubjectToMarksheetKey');
  it('maps paper subject strings to canonical Marksheet SubjectKeys', () => {
    eq(mapSubjectToMarksheetKey('Physics', 'IX'), 'physics');
    eq(mapSubjectToMarksheetKey('Computer Science', 'IX'), 'ict');
    eq(mapSubjectToMarksheetKey('Islamiat', 'IX'), 'islamicStudies');
    eq(mapSubjectToMarksheetKey('Pak Studies', 'X'), 'pakistanStudies');
    eq(mapSubjectToMarksheetKey('Maths', 'XII'), 'mathematics');
    eq(mapSubjectToMarksheetKey('UnknownSubject', 'IX'), null);
  });

  describe('omr.marksheetBridge.commitOmrScanToMarksheet');
  it('normalizes GR leading zeros, commits score, queues sheet sync, and guards conflicts', () => {
    const restore = installMemoryLocalStorage();
    try {
      clearAllPendingSync();
      const roster: StudentRecord[] = [
        {
          rowNumber: 12,
          grNo: '1042',
          studentName: 'Ali Raza',
          bFormNo: '',
          fatherName: 'Ahmed Raza',
          gender: 'Boy',
          dobDay: '1',
          dobMonth: '1',
          dobYear: '2011',
          classAdmitted: 'IX',
          currentClass: 'IX',
          parentCnic: '',
          religion: 'Islam',
          address: '',
          parentContact: '',
          emergencyContact: '',
          admissionDay: '1',
          admissionMonth: '4',
          admissionYear: '2025',
          section: 'A',
          partnerContact: '',
          shift: 'Morning',
          medium: 'English',
          picture: '',
          status: 'Enrolled',
        },
      ];

      // 1. Initial commit ("01042" normalizes to roster "1042")
      const first = commitOmrScanToMarksheet({
        scanResult: makeScanResult({ grNumber: '01042', score: 35 }),
        rosterRecords: roster,
      });
      eq(first.status, 'committed');
      if (first.status !== 'committed') return;

      eq(first.resolvedGrNo, '1042');
      eq(first.studentName, 'Ali Raza');
      eq(first.subjectKey, 'physics');
      eq(first.writtenScore, 35);
      eq(first.computed.totalObtainedMarks, 35);
      eq(first.computed.hasAnyScore, true);

      const savedEntries = loadMarksheetEntries();
      eq(savedEntries[makeMarkEntryKey('1042', 'midterm')].scores.physics, 35);

      const queueAfterFirst = listPendingSync();
      eq(queueAfterFirst.length, 1);
      eq(queueAfterFirst[0].target, 'marksheet');
      eq(queueAfterFirst[0].scope, 'midterm::1042::physics');

      // 2. Non-zero conflict guard preserves existing 35 unless forceOverwrite is true
      const conflict = commitOmrScanToMarksheet({
        scanResult: makeScanResult({ grNumber: '1042', score: 19 }),
        rosterRecords: roster,
      });
      eq(conflict.status, 'conflict');
      if (conflict.status !== 'conflict') return;
      eq(conflict.existingScore, 35);
      eq(conflict.proposedScore, 19);
      eq(loadMarksheetEntries()[makeMarkEntryKey('1042', 'midterm')].scores.physics, 35);

      // 3. Explicit forceOverwrite applies new score & updates pending queue entry
      const forced = commitOmrScanToMarksheet({
        scanResult: makeScanResult({ grNumber: '1042', score: 19 }),
        rosterRecords: roster,
        forceOverwrite: true,
      });
      eq(forced.status, 'committed');
      if (forced.status !== 'committed') return;
      eq(forced.writtenScore, 19);
      eq(loadMarksheetEntries()[makeMarkEntryKey('1042', 'midterm')].scores.physics, 19);
      eq(listPendingSync().length, 1);

      // 4. Simulated live-sheet pull with stale remote Physics (41) & newer remote English (44)
      // must keep pending OMR Physics (19) while accepting remote English (44)
      const merged = mergeMarksheetEntries(loadMarksheetEntries(), {
        [makeMarkEntryKey('1042', 'midterm')]: {
          grNo: '1042',
          studentName: 'Ali Raza',
          currentClass: 'IX',
          examType: 'midterm',
          scores: { physics: 41, english: 44 },
          updatedAt: Date.now() + 60_000,
        },
      });
      eq(merged[makeMarkEntryKey('1042', 'midterm')].scores.physics, 19);
      eq(merged[makeMarkEntryKey('1042', 'midterm')].scores.english, 44);
    } finally {
      restore();
    }
  });
}

const isDirect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.includes('omrMarksheetBridge.test'));

if (isDirect) {
  const { test, describe } = await import('node:test');
  await runOmrMarksheetBridgeTests({
    describe: (name) => {
      describe(name, () => {});
    },
    it: (name, fn) => {
      test(name, fn);
    },
    eq: (a, b, m) => assert.deepStrictEqual(a, b, m),
  });
}

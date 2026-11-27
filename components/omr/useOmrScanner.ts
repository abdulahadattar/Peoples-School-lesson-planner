import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeGrKey } from '../../services/identityNormalization';
import { normalizeGradeLevel } from '../../services/marksheet/calculations';
import type { MarksheetExamType, MarksheetGradeLevel } from '../../services/marksheet/types';
import {
  fetchClassroomResultsFromFirestore,
  fetchClassroomTestsFromFirestore,
} from '../../services/omr/classroomFirestore';
import {
  buildPrintableResultSummary,
  clearScannedResultsForTest,
  listScannedResultsByTest,
  listScannedTestCodes,
  mergeSyncedResultsForTest,
  removeScannedResultRow,
  upsertScannedResultRow,
} from '../../services/omr/scanResultsStore';
import {
  getOmrTestByCode,
  listOmrTests,
  mergeSyncedOmrTests,
  OmrTestRecord,
  todayIsoDate,
} from '../../services/omr/testRegistry';
import type {
  ClassroomTestFrequency,
  OmrDetectedMark,
  OmrScanResult,
} from '../../services/omr/types';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
import { fetchSheetData } from '../../services/sheets/fetcher';
import type { StudentRecord } from '../../services/sheets/types';
import {
  buildSampleOmrFrame,
  computeScanStats,
  decodeFileToImageBuffer,
  OmrImageBuffer,
} from './omrScannerHelpers';
import {
  pushActiveScanToMarksheet,
  pushBatchRowsToMarksheet,
  type OmrMarksheetConflictState,
} from './omrMarksheetActions';
import { useBatchCameraLoop } from './useBatchCameraLoop';
import { playScanFlagTone, playScanSuccessTone } from '../../services/omr/soundFeedback';
import { toUserErrorMessage } from '../../utils/userMessage';

export interface UseOmrScannerOptions {
  initialFilter?: {
    testCode?: string;
  } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function useOmrScanner({ initialFilter, showToast }: UseOmrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scanMode, setScanMode] = useState<'batch' | 'single'>('batch');
  const [soundMuted, setSoundMuted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<OmrImageBuffer | null>(null);
  const [scanResult, setScanResult] = useState<OmrScanResult | null>(null);
  const [effectiveAnswers, setEffectiveAnswers] = useState<OmrDetectedMark[]>([]);

  const [roster, setRoster] = useState<StudentRecord[]>([]);
  const [grNumber, setGrNumber] = useState('');
  const [gradeLevel, setGradeLevel] = useState<MarksheetGradeLevel>('IX');

  const [registeredTests, setRegisteredTests] = useState<OmrTestRecord[]>(() => listOmrTests());
  const [activeTestCode, setActiveTestCode] = useState<string>(
    () => initialFilter?.testCode || listOmrTests()[0]?.testCode || 'sample_ix_phy_w01'
  );
  const [targetExamType, setTargetExamType] = useState<MarksheetExamType>('midterm');
  const [marksheetConflict, setMarksheetConflict] = useState<OmrMarksheetConflictState | null>(
    null
  );
  const [resultsTick, setResultsTick] = useState(0);
  const [lastSavedSummary, setLastSavedSummary] = useState<string | null>(null);

  useEffect(() => {
    setRegisteredTests(listOmrTests());
    if (initialFilter?.testCode) {
      setActiveTestCode(initialFilter.testCode);
      const found = getOmrTestByCode(initialFilter.testCode);
      if (found) {
        setGradeLevel(normalizeGradeLevel(found.classLevel) || 'IX');
      }
    }
  }, [initialFilter]);

  // Hydrate saved classroom tests from Firestore
  useEffect(() => {
    let cancelled = false;
    fetchClassroomTestsFromFirestore()
      .then((remoteTests) => {
        if (cancelled || remoteTests.length === 0) return;
        const merged = mergeSyncedOmrTests(remoteTests);
        setRegisteredTests(merged);
        setResultsTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate scanned results for activeTestCode from Firestore
  useEffect(() => {
    if (!activeTestCode) return;
    let cancelled = false;
    fetchClassroomResultsFromFirestore(activeTestCode)
      .then((remoteRows) => {
        if (cancelled || remoteRows.length === 0) return;
        mergeSyncedResultsForTest(activeTestCode, remoteRows);
        setResultsTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTestCode]);

  // Load Student Roster for GR cross-referencing (Name + Father's Name)
  useEffect(() => {
    let cancelled = false;
    fetchSheetData()
      .then((res) => {
        if (!cancelled && Array.isArray(res.records)) setRoster(res.records);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const applyScannedResult = useCallback(
    (res: OmrScanResult, img: OmrImageBuffer, silentToast = false) => {
      setCapturedImage(img);
      setLastSavedSummary(null);
      setScanResult(res);
      setEffectiveAnswers(res.rawAnswers);
      setGrNumber(res.grNumber);

      const matchedTest = getOmrTestByCode(res.qrPayload.pid);
      const nextGrade = normalizeGradeLevel(matchedTest?.classLevel || res.qrPayload.cls) || gradeLevel;
      setGradeLevel(nextGrade);
      setActiveTestCode(res.qrPayload.pid || activeTestCode);
      setRegisteredTests(listOmrTests());

      const recorded = upsertScannedResultRow({
        scanResult: res,
        rosterRecords: roster,
        testNumberOverride: matchedTest?.testNumber,
        testDateOverride: matchedTest?.testDate,
      });
      setResultsTick((t) => t + 1);

      if (!silentToast) {
        const who = recorded
          ? `${recorded.studentName} (GR #${recorded.grNo})`
          : `GR #${res.grNumber || '?'}`;
        const subLabel = matchedTest?.subject || res.qrPayload.sub;
        if (res.flaggedQuestions.length > 0) {
          showToast(
            `${subLabel} · ${who}: ${res.score}/${res.total} — Review ${res.flaggedQuestions.length} flagged item(s).`,
            'info'
          );
        } else {
          showToast(`Auto-graded ${subLabel} · ${who}: ${res.score}/${res.total}`, 'success');
        }
      }
    },
    [activeTestCode, gradeLevel, roster, showToast]
  );

  const lookupRegistryKey = useCallback(
    (pid: string) => getOmrTestByCode(pid)?.answerKey || null,
    []
  );

  const processFrame = useCallback(
    (img: OmrImageBuffer) => {
      const outcome = gradeOmrImageData(img, { lookupAnswerKey: lookupRegistryKey });
      if ('error' in outcome) {
        setCapturedImage(img);
        setScanResult(null);
        setEffectiveAnswers([]);
        showToast(toUserErrorMessage(outcome.error, 'Could not read that OMR sheet.'), 'error');
        return null;
      }
      if (outcome.result.flaggedQuestions.length > 0) {
        playScanFlagTone(soundMuted);
      } else {
        playScanSuccessTone(soundMuted);
      }
      applyScannedResult(outcome.result, img, false);
      return outcome.result;
    },
    [applyScannedResult, lookupRegistryKey, showToast, soundMuted]
  );

  const {
    batchTelemetry,
    resetBatchSession,
    recordManualSignature,
  } = useBatchCameraLoop({
    videoRef,
    isCameraActive,
    scanMode,
    soundMuted,
    lookupAnswerKey: lookupRegistryKey,
    onCaptureAccepted: (res, img) => applyScannedResult(res, img, false),
  });

  const handleStartCamera = async () => {
    setCameraError(null);
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser. Upload sheet photos or load a sample.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      setCameraError(
        toUserErrorMessage(
          err,
          'Camera unavailable. Upload photos or load a sample sheet instead.'
        )
      );
    }
  };

  const handleCaptureCameraFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 64 || video.videoHeight < 64) {
      showToast('Camera feed is still warming up.', 'info');
      return;
    }
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth;
    offscreen.height = video.videoHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const frame = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const imgBuf = { data: new Uint8ClampedArray(frame.data), width: frame.width, height: frame.height };
    if (scanMode === 'single') {
      stopCamera();
      processFrame(imgBuf);
    } else {
      const res = processFrame(imgBuf);
      if (res) {
        recordManualSignature(res);
      }
    }
  };

  const handleFilesUpload = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    stopCamera();
    let okCount = 0;
    let failCount = 0;

    for (const file of fileArr) {
      const imgBuf = await decodeFileToImageBuffer(file);
      if (!imgBuf) {
        failCount++;
        continue;
      }
      if (fileArr.length === 1) {
        processFrame(imgBuf);
        return;
      }
      const outcome = gradeOmrImageData(imgBuf, { lookupAnswerKey: lookupRegistryKey });
      if ('error' in outcome) failCount++;
      else {
        okCount++;
        applyScannedResult(outcome.result, imgBuf, true);
      }
    }

    if (fileArr.length > 1) {
      showToast(
        `Batch scanned ${okCount} sheet(s)${failCount > 0 ? ` (${failCount} unreadable)` : ''}.`,
        okCount > 0 ? 'success' : 'error'
      );
    }
  };

  const handleLoadSampleSheet = () => {
    stopCamera();
    const synthetic = buildSampleOmrFrame({
      activeReg: getOmrTestByCode(activeTestCode),
      gradeLevel,
      roster,
    });
    processFrame(synthetic);
  };

  const activeRegistryTest = useMemo(
    () => getOmrTestByCode(activeTestCode) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTestCode, registeredTests, resultsTick]
  );

  const computedStats = useMemo(
    () => computeScanStats(scanResult, effectiveAnswers, activeRegistryTest?.answerKey),
    [scanResult, effectiveAnswers, activeRegistryTest]
  );

  const matchedRosterStudent = useMemo(() => {
    const target = normalizeGrKey(grNumber);
    return target ? roster.find((r) => normalizeGrKey(r.grNo) === target) || null : null;
  }, [roster, grNumber]);

  const classEnrolledCount = useMemo(
    () =>
      roster.filter(
        (r) =>
          normalizeGradeLevel(r.currentClass) === gradeLevel &&
          !(r.status || '').toLowerCase().includes('drop') &&
          !(r.status || '').toLowerCase().includes('left')
      ).length,
    [roster, gradeLevel]
  );

  const handleOverrideQuestion = (qIdx: number, nextMark: OmrDetectedMark) => {
    const updated = [...effectiveAnswers];
    updated[qIdx] = nextMark;
    setEffectiveAnswers(updated);
    setLastSavedSummary(null);

    if (scanResult && grNumber.trim()) {
      upsertScannedResultRow({
        scanResult,
        grNoOverride: grNumber.trim(),
        effectiveAnswers: updated,
        rosterRecords: roster,
        testNumberOverride: activeRegistryTest?.testNumber,
        testDateOverride: activeRegistryTest?.testDate,
      });
      setResultsTick((t) => t + 1);
    }
  };

  const handleSaveUpdatedStudentRow = () => {
    if (!scanResult || !grNumber.trim()) {
      showToast('Enter a valid student GR number before saving.', 'error');
      return;
    }
    const saved = upsertScannedResultRow({
      scanResult,
      grNoOverride: grNumber.trim(),
      effectiveAnswers,
      rosterRecords: roster,
      testNumberOverride: activeRegistryTest?.testNumber,
      testDateOverride: activeRegistryTest?.testDate,
    });
    setResultsTick((t) => t + 1);
    if (saved) {
      const msg = `Saved ${saved.studentName} (GR #${saved.grNo}): ${saved.score}/${saved.total} (${saved.percentage}%)`;
      setLastSavedSummary(msg);
      showToast(msg, 'success');
    }
  };

  const resultSummary = useMemo(() => {
    const rows = listScannedResultsByTest(activeTestCode);
    const fallbackTestFrequency: ClassroomTestFrequency =
      activeRegistryTest?.testFrequency === 'monthly' || scanResult?.qrPayload.tf === 'monthly'
        ? 'monthly'
        : 'weekly';

    return buildPrintableResultSummary({
      testCode: activeTestCode,
      rows,
      rosterRecords: roster,
      fallbackSubject: activeRegistryTest?.subject || scanResult?.qrPayload.sub || 'Physics',
      fallbackClassLevel: gradeLevel,
      fallbackTestFrequency,
      fallbackTestNumber: activeRegistryTest?.testNumber || 'Test #01',
      fallbackTestDate: activeRegistryTest?.testDate || todayIsoDate(),
      fallbackTitle: activeRegistryTest?.title || scanResult?.qrPayload.ttl || 'Classroom MCQ Test',
      fallbackTotalMarks: activeRegistryTest?.questionCount || scanResult?.total || 30,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTestCode, activeRegistryTest, roster, scanResult, gradeLevel, resultsTick]);

  const availableTestCodes = useMemo(() => {
    const scannedGroups = listScannedTestCodes();
    const map = new Map<string, { testCode: string; label: string; count: number }>();

    registeredTests.forEach((t) => {
      map.set(t.testCode, {
        testCode: t.testCode,
        label: `${t.subject} (${t.classLevel}) · ${t.testNumber} · ${t.testDate}`,
        count: listScannedResultsByTest(t.testCode).length,
      });
    });

    scannedGroups.forEach((g) => {
      if (!map.has(g.testCode)) {
        map.set(g.testCode, {
          testCode: g.testCode,
          label: `${g.subject} (${g.classLevel}) · ${g.testNumber} · ${g.testDate}`,
          count: g.count,
        });
      }
    });

    if (!map.has(activeTestCode)) {
      map.set(activeTestCode, {
        testCode: activeTestCode,
        label: `${resultSummary.subject} (${resultSummary.classLevel}) · ${resultSummary.testNumber}`,
        count: resultSummary.scannedCount,
      });
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registeredTests, activeTestCode, resultSummary, resultsTick]);

  const handlePushActiveToMarksheet = (forceOverwrite = false) => {
    const res = pushActiveScanToMarksheet({
      scanResult,
      grNumber,
      gradeLevel,
      effectiveScore: computedStats.score,
      roster,
      examType: targetExamType,
      forceOverwrite,
    });
    if (res.status === 'error') {
      showToast(toUserErrorMessage(res.message, 'Could not save score to marksheet.'), 'error');
      return;
    }
    if (res.status === 'conflict' && res.conflict) {
      setMarksheetConflict(res.conflict);
      return;
    }
    setMarksheetConflict(null);
    setResultsTick((t) => t + 1);
    if (res.message) {
      setLastSavedSummary(res.message);
      showToast(res.message, 'success');
    }
  };

  const handlePushBatchToMarksheet = (forceOverwrite = false) => {
    const rows = resultSummary.rows;
    if (!rows.length) {
      showToast('Scan at least one OMR sheet before saving to marksheets.', 'info');
      return;
    }
    const res = pushBatchRowsToMarksheet({
      rows,
      roster,
      examType: targetExamType,
      answerKey: activeRegistryTest?.answerKey || scanResult?.qrPayload.key || '',
      forceOverwrite,
    });
    setResultsTick((t) => t + 1);
    if (res.firstConflict) {
      setMarksheetConflict(res.firstConflict);
      if (res.committedCount > 0) {
        showToast(
          `Saved ${res.committedCount} student(s); confirm overwrite for GR #${res.firstConflict.resolvedGrNo}.`,
          'info'
        );
      }
      return;
    }
    setMarksheetConflict(null);
    if (res.committedCount > 0) {
      showToast(
        `Saved ${res.committedCount} OMR score(s) to ${targetExamType} marksheets.`,
        'success'
      );
    } else if (res.errorMessages.length > 0) {
      showToast(toUserErrorMessage(res.errorMessages[0], 'Could not save scores to marksheet.'), 'error');
    } else {
      showToast('All scanned rows are already saved to marksheets.', 'info');
    }
  };

  const confirmMarksheetOverwrite = () => {
    const conflict = marksheetConflict;
    if (!conflict) return;
    setMarksheetConflict(null);
    if (conflict.mode === 'single') {
      handlePushActiveToMarksheet(true);
    } else {
      const res = pushBatchRowsToMarksheet({
        rows: conflict.rowsSnapshot || resultSummary.rows,
        roster,
        examType: conflict.examType,
        answerKey: conflict.answerKey || activeRegistryTest?.answerKey || '',
        forceOverwrite: true,
      });
      setResultsTick((t) => t + 1);
      if (res.committedCount > 0) {
        showToast(
          `Updated ${res.committedCount} OMR score(s) in ${conflict.examType} marksheets.`,
          'success'
        );
      }
    }
  };

  return {
    videoRef,
    fileInputRef,
    isCameraActive,
    scanMode,
    setScanMode,
    soundMuted,
    setSoundMuted,
    batchTelemetry,
    resetBatchSession,
    cameraError,
    capturedImage,
    scanResult,
    effectiveAnswers,
    roster,
    grNumber,
    setGrNumber,
    gradeLevel,
    registeredTests,
    refreshRegisteredTests: () => setRegisteredTests(listOmrTests()),
    activeTestCode,
    setActiveTestCode,
    activeRegistryTest,
    classEnrolledCount,
    matchedRosterStudent,
    computedStats,
    lastSavedSummary,
    resultSummary,
    availableTestCodes,
    targetExamType,
    setTargetExamType,
    marksheetConflict,
    dismissMarksheetConflict: () => setMarksheetConflict(null),
    confirmMarksheetOverwrite,
    handleStartCamera,
    stopCamera,
    handleCaptureCameraFrame,
    handleFilesUpload,
    handleLoadSampleSheet,
    handleOverrideQuestion,
    handleSaveUpdatedStudentRow,
    handlePushActiveToMarksheet,
    handlePushBatchToMarksheet,
    handleRemoveResultRow: (grNo: string) => {
      removeScannedResultRow(activeTestCode, grNo);
      setResultsTick((t) => t + 1);
    },
    handleClearTestResults: () => {
      clearScannedResultsForTest(activeTestCode);
      setResultsTick((t) => t + 1);
    },
  };
}

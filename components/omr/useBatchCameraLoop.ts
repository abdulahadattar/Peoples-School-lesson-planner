import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  BatchScanController,
  type BatchTelemetry,
} from '../../services/omr/batchStateMachine';
import { playScanFlagTone, playScanSuccessTone } from '../../services/omr/soundFeedback';
import type { OmrScanResult } from '../../services/omr/types';
import { gradeOmrImageData } from '../../services/omr/visionEngine';
import type { OmrImageBuffer } from './omrScannerHelpers';

export interface UseBatchCameraLoopOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  isCameraActive: boolean;
  scanMode: 'batch' | 'single';
  soundMuted: boolean;
  lookupAnswerKey: (testCode: string) => string | null;
  onCaptureAccepted: (result: OmrScanResult, img: OmrImageBuffer) => void;
}

const INITIAL_TELEMETRY: BatchTelemetry = {
  phase: 'idle',
  sharpnessScore: 0,
  motionDelta: 0,
  consecutiveStable: 0,
  batchCount: 0,
  lastScannedGr: null,
  statusText: 'Start camera to scan printed sheets',
};

export function useBatchCameraLoop({
  videoRef,
  isCameraActive,
  scanMode,
  soundMuted,
  lookupAnswerKey,
  onCaptureAccepted,
}: UseBatchCameraLoopOptions) {
  const controllerRef = useRef<BatchScanController>(new BatchScanController());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lookupAnswerKeyRef = useRef(lookupAnswerKey);
  const onCaptureAcceptedRef = useRef(onCaptureAccepted);
  lookupAnswerKeyRef.current = lookupAnswerKey;
  onCaptureAcceptedRef.current = onCaptureAccepted;
  const [batchTelemetry, setBatchTelemetry] = useState<BatchTelemetry>(INITIAL_TELEMETRY);

  const resetBatchSession = useCallback(() => {
    controllerRef.current.reset();
    setBatchTelemetry({
      ...controllerRef.current.getTelemetry(),
      phase: isCameraActive && scanMode === 'batch' ? 'searching' : 'idle',
    });
  }, [isCameraActive, scanMode]);

  const recordManualSignature = useCallback((result: OmrScanResult) => {
    const sig = `${result.qrPayload.pid}::${result.grNumber || result.rawAnswers.join('')}`;
    const res = controllerRef.current.recordDecodeResult({
      ok: true,
      signature: sig,
      grNumber: result.grNumber,
    });
    setBatchTelemetry(res.telemetry);
  }, []);

  useEffect(() => {
    if (!isCameraActive || scanMode !== 'batch') {
      setBatchTelemetry((prev) => (prev.phase === 'idle' ? prev : { ...prev, phase: 'idle' }));
      return;
    }

    controllerRef.current.reset();
    setBatchTelemetry(controllerRef.current.getTelemetry());

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth < 120 || video.videoHeight < 120) return;

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const offscreen = canvasRef.current;
      if (offscreen.width !== video.videoWidth || offscreen.height !== video.videoHeight) {
        offscreen.width = video.videoWidth;
        offscreen.height = video.videoHeight;
      }
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);
      const frame = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      const rgba = new Uint8ClampedArray(frame.data);

      const step = controllerRef.current.stepFrame(rgba, frame.width, frame.height, Date.now());
      if (!step.shouldAttemptDecode) {
        setBatchTelemetry(step.telemetry);
        return;
      }

      const img: OmrImageBuffer = { data: rgba, width: frame.width, height: frame.height };
      const outcome = gradeOmrImageData(img, {
        lookupAnswerKey: (pid) => lookupAnswerKeyRef.current(pid),
      });

      if ('error' in outcome) {
        const failRes = controllerRef.current.recordDecodeResult({ ok: false });
        setBatchTelemetry(failRes.telemetry);
        return;
      }

      const sig = `${outcome.result.qrPayload.pid}::${outcome.result.grNumber || outcome.result.rawAnswers.join('')}`;
      const recorded = controllerRef.current.recordDecodeResult({
        ok: true,
        signature: sig,
        grNumber: outcome.result.grNumber,
      });
      setBatchTelemetry(recorded.telemetry);

      if (recorded.accepted) {
        if (outcome.result.flaggedQuestions.length > 0) {
          playScanFlagTone(soundMuted);
        } else {
          playScanSuccessTone(soundMuted);
        }
        onCaptureAcceptedRef.current(outcome.result, img);
      }
    }, 320);

    return () => window.clearInterval(timer);
  }, [isCameraActive, scanMode, soundMuted, videoRef]);

  return {
    batchTelemetry,
    resetBatchSession,
    recordManualSignature,
  };
}

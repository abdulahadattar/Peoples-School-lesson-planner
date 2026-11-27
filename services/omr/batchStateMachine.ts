export type BatchScanPhase =
  | 'idle'
  | 'searching'
  | 'stabilizing'
  | 'captured'
  | 'waiting_for_swap';

export interface FrameQualityMetrics {
  sharpnessScore: number;
  motionDelta: number;
  sampleGrid: Uint8Array;
}

export interface BatchTelemetry {
  phase: BatchScanPhase;
  sharpnessScore: number;
  motionDelta: number;
  consecutiveStable: number;
  batchCount: number;
  lastScannedGr: string | null;
  statusText: string;
}

export interface BatchControllerConfig {
  requiredStableFrames?: number;
  motionThreshold?: number;
  swapMotionThreshold?: number;
  minSharpness?: number;
  capturedHoldMs?: number;
  swapQuietFrames?: number;
}

const GRID_SIDE = 24;

/**
 * Downsamples center region of RGBA buffer into a 24x24 grayscale grid and computes
 * normalized local edge sharpness (0..1) plus frame-to-frame motion delta (0..1).
 */
export function computeFrameMetrics(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  prevSampleGrid: Uint8Array | null
): FrameQualityMetrics {
  const sampleGrid = new Uint8Array(GRID_SIDE * GRID_SIDE);
  if (!rgba || width < 32 || height < 32) {
    return { sharpnessScore: 0, motionDelta: 1, sampleGrid };
  }

  const x0 = Math.floor(width * 0.12);
  const y0 = Math.floor(height * 0.12);
  const spanW = Math.max(GRID_SIDE, Math.floor(width * 0.76));
  const spanH = Math.max(GRID_SIDE, Math.floor(height * 0.76));

  let diffSum = 0;
  for (let gy = 0; gy < GRID_SIDE; gy++) {
    const py = Math.min(height - 1, y0 + Math.floor(((gy + 0.5) / GRID_SIDE) * spanH));
    const rowOff = py * width;
    for (let gx = 0; gx < GRID_SIDE; gx++) {
      const px = Math.min(width - 1, x0 + Math.floor(((gx + 0.5) / GRID_SIDE) * spanW));
      const p = (rowOff + px) * 4;
      const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) | 0;
      const idx = gy * GRID_SIDE + gx;
      sampleGrid[idx] = lum;
      if (prevSampleGrid && prevSampleGrid.length === sampleGrid.length) {
        diffSum += Math.abs(lum - prevSampleGrid[idx]);
      }
    }
  }

  let gradSum = 0;
  let gradCount = 0;
  for (let gy = 0; gy < GRID_SIDE - 1; gy++) {
    for (let gx = 0; gx < GRID_SIDE - 1; gx++) {
      const idx = gy * GRID_SIDE + gx;
      const c = sampleGrid[idx];
      gradSum += Math.abs(c - sampleGrid[idx + 1]) + Math.abs(c - sampleGrid[idx + GRID_SIDE]);
      gradCount += 2;
    }
  }

  const meanGrad = gradCount > 0 ? gradSum / gradCount : 0;
  const sharpnessScore = Math.max(0, Math.min(1, meanGrad / 36));
  const motionDelta =
    prevSampleGrid && prevSampleGrid.length === sampleGrid.length
      ? Math.max(0, Math.min(1, diffSum / (sampleGrid.length * 255)))
      : 0.5;

  return { sharpnessScore, motionDelta, sampleGrid };
}

export class BatchScanController {
  private phase: BatchScanPhase = 'searching';
  private consecutiveStable = 0;
  private swapQuietCount = 0;
  private swapMotionSeen = false;
  private batchCount = 0;
  private lastSignature: string | null = null;
  private lastScannedGr: string | null = null;
  private capturedAtMs = 0;
  private prevGrid: Uint8Array | null = null;
  private lastSharpness = 0;
  private lastMotion = 0;

  private readonly requiredStableFrames: number;
  private readonly motionThreshold: number;
  private readonly swapMotionThreshold: number;
  private readonly minSharpness: number;
  private readonly capturedHoldMs: number;
  private readonly swapQuietFrames: number;

  constructor(config: BatchControllerConfig = {}) {
    this.requiredStableFrames = config.requiredStableFrames ?? 2;
    this.motionThreshold = config.motionThreshold ?? 0.045;
    this.swapMotionThreshold = config.swapMotionThreshold ?? 0.075;
    this.minSharpness = config.minSharpness ?? 0.14;
    this.capturedHoldMs = config.capturedHoldMs ?? 1100;
    this.swapQuietFrames = config.swapQuietFrames ?? 2;
  }

  reset() {
    this.phase = 'searching';
    this.consecutiveStable = 0;
    this.swapQuietCount = 0;
    this.swapMotionSeen = false;
    this.batchCount = 0;
    this.lastSignature = null;
    this.lastScannedGr = null;
    this.capturedAtMs = 0;
    this.prevGrid = null;
    this.lastSharpness = 0;
    this.lastMotion = 0;
  }

  /**
   * Feeds a raw video frame quality reading into the state machine.
   * Returns `{ shouldAttemptDecode: true }` when steady + focused and ready to decode.
   */
  stepFrame(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    nowMs: number = Date.now()
  ): { shouldAttemptDecode: boolean; telemetry: BatchTelemetry } {
    const metrics = computeFrameMetrics(rgba, width, height, this.prevGrid);
    this.prevGrid = metrics.sampleGrid;
    this.lastSharpness = metrics.sharpnessScore;
    this.lastMotion = metrics.motionDelta;

    const isSteady = metrics.motionDelta <= this.motionThreshold;
    const isSharp = metrics.sharpnessScore >= this.minSharpness;

    if (this.phase === 'captured') {
      if (nowMs - this.capturedAtMs >= this.capturedHoldMs) {
        this.phase = 'waiting_for_swap';
        this.swapMotionSeen = false;
        this.swapQuietCount = 0;
      }
      return { shouldAttemptDecode: false, telemetry: this.getTelemetry() };
    }

    if (this.phase === 'waiting_for_swap') {
      if (metrics.motionDelta >= this.swapMotionThreshold) {
        this.swapMotionSeen = true;
        this.swapQuietCount = 0;
        return { shouldAttemptDecode: false, telemetry: this.getTelemetry() };
      }
      if (this.swapMotionSeen && isSteady && isSharp) {
        this.swapQuietCount++;
        if (this.swapQuietCount >= this.swapQuietFrames) {
          // Page swap completed and new sheet settled; allow re-capture
          this.lastSignature = null;
          this.phase = 'stabilizing';
          this.consecutiveStable = 1;
          return { shouldAttemptDecode: true, telemetry: this.getTelemetry() };
        }
      }
      return { shouldAttemptDecode: false, telemetry: this.getTelemetry() };
    }

    if (isSteady && isSharp) {
      this.consecutiveStable++;
      if (this.consecutiveStable >= this.requiredStableFrames) {
        this.phase = 'stabilizing';
        return { shouldAttemptDecode: true, telemetry: this.getTelemetry() };
      }
      this.phase = 'stabilizing';
      return { shouldAttemptDecode: false, telemetry: this.getTelemetry() };
    }

    this.consecutiveStable = 0;
    this.phase = 'searching';
    return { shouldAttemptDecode: false, telemetry: this.getTelemetry() };
  }

  /**
   * Notifies controller whether OMR decode succeeded on the attempted frame.
   * Rejects duplicate captures while holding the exact same sheet.
   */
  recordDecodeResult(
    outcome: { ok: true; signature: string; grNumber: string } | { ok: false },
    nowMs: number = Date.now()
  ): { accepted: boolean; telemetry: BatchTelemetry } {
    if (!outcome.ok) {
      return { accepted: false, telemetry: this.getTelemetry() };
    }
    if (this.lastSignature && outcome.signature === this.lastSignature) {
      this.phase = 'waiting_for_swap';
      return { accepted: false, telemetry: this.getTelemetry() };
    }
    this.lastSignature = outcome.signature;
    this.lastScannedGr = outcome.grNumber || null;
    this.batchCount++;
    this.capturedAtMs = nowMs;
    this.consecutiveStable = 0;
    this.swapMotionSeen = false;
    this.swapQuietCount = 0;
    this.phase = 'captured';
    return { accepted: true, telemetry: this.getTelemetry() };
  }

  getTelemetry(): BatchTelemetry {
    let statusText = 'Frame OMR sheet inside corner brackets';
    if (this.phase === 'stabilizing') {
      statusText = 'Sheet detected — holding focus steady...';
    } else if (this.phase === 'captured') {
      statusText = `Captured ${this.lastScannedGr ? `GR #${this.lastScannedGr}` : `#${this.batchCount}`} — swap to next sheet`;
    } else if (this.phase === 'waiting_for_swap') {
      statusText = this.swapMotionSeen
        ? 'Swap detected — settle next sheet inside frame'
        : 'Waiting for next sheet (flip or slide page)...';
    }
    return {
      phase: this.phase,
      sharpnessScore: Number(this.lastSharpness.toFixed(2)),
      motionDelta: Number(this.lastMotion.toFixed(3)),
      consecutiveStable: this.consecutiveStable,
      batchCount: this.batchCount,
      lastScannedGr: this.lastScannedGr,
      statusText,
    };
  }
}

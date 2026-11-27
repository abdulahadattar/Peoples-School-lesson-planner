import React, { useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import type { BatchTelemetry } from '../../services/omr/batchStateMachine';
import type { OmrDetectedMark, OmrScanResult } from '../../services/omr/types';

export interface OmrScannerCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isCameraActive: boolean;
  scanMode: 'batch' | 'single';
  batchTelemetry: BatchTelemetry;
  capturedImage: { data: Uint8ClampedArray; width: number; height: number } | null;
  scanResult: OmrScanResult | null;
  effectiveAnswers: OmrDetectedMark[];
  cameraError: string | null;
  onStartCamera: () => void;
  onUploadClick: () => void;
  onLoadSample: () => void;
}

export const OmrScannerCanvas: React.FC<OmrScannerCanvasProps> = ({
  videoRef,
  isCameraActive,
  scanMode,
  batchTelemetry,
  capturedImage,
  scanResult,
  effectiveAnswers,
  cameraError,
  onStartCamera,
  onUploadClick,
  onLoadSample,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !capturedImage) return;

    canvas.width = capturedImage.width;
    canvas.height = capturedImage.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = new ImageData(
      new Uint8ClampedArray(capturedImage.data),
      capturedImage.width,
      capturedImage.height
    );
    ctx.putImageData(imgData, 0, 0);

    if (!scanResult) return;

    // 1. Draw green corner fiducial quadrilateral & corner markers
    if (scanResult.fiducialsDetected && scanResult.fiducialPointsPx) {
      const { tl, tr, br, bl } = scanResult.fiducialPointsPx;
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.lineWidth = Math.max(2, capturedImage.width * 0.003);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();

      for (const pt of [tl, tr, br, bl]) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(6, capturedImage.width * 0.007), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Draw QR Code highlight
    if (scanResult.qrCornersPx) {
      const { tl, tr, br, bl } = scanResult.qrCornersPx;
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = Math.max(2, capturedImage.width * 0.0028);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 3. Overlay detected & overridden bubbles
    const key = scanResult.qrPayload.key;
    for (const det of scanResult.bubbleDetections) {
      const effectiveMark = effectiveAnswers[det.questionIndex] ?? scanResult.rawAnswers[det.questionIndex];
      const expectedLetter = key[det.questionIndex];
      const isSelected = effectiveMark === det.option;
      const isCorrectOpt = expectedLetter === det.option;
      const isFlagged =
        effectiveMark === 'BLANK' ||
        effectiveMark === 'MULTI' ||
        scanResult.flaggedQuestions.includes(det.questionIndex + 1);

      if (isSelected) {
        const correct = effectiveMark === expectedLetter;
        ctx.save();
        ctx.strokeStyle = correct ? '#10b981' : '#ef4444';
        ctx.fillStyle = correct ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        ctx.lineWidth = Math.max(2, det.radiusPx * 0.28);
        ctx.beginPath();
        ctx.arc(det.px, det.py, det.radiusPx * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (det.filled && (effectiveMark === 'MULTI' || isFlagged)) {
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = Math.max(2, det.radiusPx * 0.26);
        ctx.beginPath();
        ctx.arc(det.px, det.py, det.radiusPx * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (isCorrectOpt && effectiveMark !== expectedLetter) {
        // Outline expected correct answer in subtle emerald dashed circle
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = Math.max(1.5, det.radiusPx * 0.2);
        ctx.beginPath();
        ctx.arc(det.px, det.py, det.radiusPx * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [capturedImage, scanResult, effectiveAnswers]);

  return (
    <div className="bg-white dark:bg-brand-surface border border-brand-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-brand-text-secondary">
        <span className="font-semibold text-brand-text-primary">
          {isCameraActive
            ? scanMode === 'batch'
              ? 'Batch Camera'
              : 'Camera Preview'
            : capturedImage
              ? 'Graded Sheet Preview'
              : 'OMR Sheet Preview'}
        </span>
        {isCameraActive && scanMode === 'batch' ? (
          <span className="font-mono tabular-nums text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
            Session: {batchTelemetry.batchCount} scanned
          </span>
        ) : (
          capturedImage && (
            <span className="font-mono tabular-nums text-[11px] text-brand-text-tertiary">
              {capturedImage.width} × {capturedImage.height}px
            </span>
          )
        )}
      </div>

      <div
        className={`relative w-full aspect-[210/297] max-h-[680px] rounded-xl overflow-hidden bg-slate-950/95 flex items-center justify-center transition-colors border-2 ${
          isCameraActive && batchTelemetry.phase === 'captured'
            ? 'border-emerald-500'
            : isCameraActive && batchTelemetry.phase === 'waiting_for_swap'
              ? 'border-amber-400/80'
              : 'border-brand-border/80'
        }`}
      >
        {isCameraActive && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            {/* Corner Viewfinder Registration Guides */}
            <div className="pointer-events-none absolute inset-4 sm:inset-6">
              <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-emerald-400 rounded-tl-md" />
              <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-emerald-400 rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-emerald-400 rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-emerald-400 rounded-br-md" />
            </div>

            {scanMode === 'batch' && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-slate-950/85 backdrop-blur-md border border-white/15 px-3 py-2 flex items-center justify-between gap-2 text-xs text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      batchTelemetry.phase === 'captured'
                        ? 'bg-emerald-400'
                        : batchTelemetry.phase === 'waiting_for_swap'
                          ? 'bg-amber-400'
                          : batchTelemetry.phase === 'stabilizing'
                            ? 'bg-blue-400'
                            : 'bg-slate-400'
                    }`}
                  />
                  <span className="truncate font-medium">{batchTelemetry.statusText}</span>
                </div>
                <span className="font-mono tabular-nums text-[10px] text-slate-300 shrink-0">
                  Focus {Math.round(batchTelemetry.sharpnessScore * 100)}%
                </span>
              </div>
            )}
          </>
        )}

        {!isCameraActive && capturedImage && (
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
          />
        )}

        {!isCameraActive && !capturedImage && (
          <div className="p-6 text-center max-w-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-blue-400 flex items-center justify-center mx-auto">
              <Camera className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white">Ready to Scan OMR Sheets</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Align all 4 corner squares and the QR code inside the frame, or upload a sheet photo.
              </p>
            </div>
            {cameraError && (
              <p className="text-xs text-amber-300 bg-amber-950/60 border border-amber-700/50 rounded-lg px-3 py-2">
                {cameraError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={onStartCamera}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Start Camera
              </button>
              <button
                type="button"
                onClick={onUploadClick}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Upload Photo
              </button>
              <button
                type="button"
                onClick={onLoadSample}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-700/50 text-xs font-semibold cursor-pointer transition-colors"
              >
                Load Sample Sheet
              </button>
            </div>
          </div>
        )}
      </div>

      {scanResult && (
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-brand-text-secondary pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Correct &amp; Page Corners
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            Incorrect Answer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Needs Review (Multiple / Blank)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Test QR Code
          </span>
        </div>
      )}
    </div>
  );
};

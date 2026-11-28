# ENGINEERING PRD & IMPLEMENTATION DIRECTIVE: UNIFIED AI-TO-OMR EXAM & MARKSHEET PIPELINE (`PHSSJ-Portal`)

> **STATUS:** TODO / Planned for next turn (DO NOT IMPLEMENT YET)

## 0. MANDATORY AGENT OPERATING RULES (READ FIRST)
1. **Read Before Writing:** Before creating or modifying any file, you MUST inspect the existing files listed in Section 2 (`package.json`, `AGENTS.md`, `services/paper/schema.ts`, `services/export/pdfExport.ts`, `services/marksheet/types.ts`, `components/marksheets/useMarksheetsState.ts`, `components/records/useStudentRecords.ts`, `hooks/useSheetSyncQueue.ts`, `components/navigation/AppViewRouter.tsx`, and `scripts/unit-tests.ts`).
2. **Zero Duplication / Reuse Existing Modules:**
   - DO NOT build a separate student database, identity normalizer, PDF wrapper, or Google Sheets sync queue.
   - Reuse `services/identityNormalization.ts` for GR Number normalization.
   - Reuse `components/records/useStudentRecords.ts` for student lookups and batch class sheet generation.
   - Reuse `components/marksheets/useMarksheetsState.ts`, `services/marksheet/calculations.ts`, and `services/marksheet/storage.ts` for score injection and grade computation.
   - Reuse `hooks/useSheetSyncQueue.ts` for offline-first cloud persistence.
   - Reuse `components/ui/*` (`BaseModal`, `Toast`, `StatusBadge`, `EmptyState`, `SegmentedControl`) for all UI elements.
3. **Keep It Simple & Modular:** Follow the repository's existing micro-module pattern (`services/omr/*` and `components/omr/*`). Keep every file concise, pure TypeScript, and free of heavy external binaries (use lightweight zero-dependency or pure-JS libraries like `qr` or `jsqr` + HTML5 Canvas pixel sampling rather than multi-megabyte OpenCV WASM bundles).
4. **Stage-Gated Verification (NO SKIPPING):** You must implement this in **4 sequential stages**. At the end of EACH stage, write unit/integration tests and execute the repo's existing test scripts (`npx tsx scripts/unit-tests.ts` and `npm run build` / `scripts/wiring-audit.mjs`) to verify 100% pass rate before moving to the next stage.

---

## 1. OBJECTIVE & END-TO-END WORKFLOW
Close the loop between **Question Paper Generation** (`services/paper/`) and **A4 Marksheet Generation** (`services/marksheet/`) inside `PHSSJ-Portal` so a teacher can:
1. Generate an MCQ exam paper in `PaperPanel.tsx` and export a matching **A4 OMR Bubble Sheet PDF** (either generic with GR bubbles, or pre-printed per student in a class using `useStudentRecords.ts`) containing an embedded **QR Metadata Code** and **4 corner fiducial markers**.
2. Scan completed physical sheets offline on any phone/laptop camera in a new **OMR Scanner** view (`OmrScannerView.tsx`).
3. Automatically decode the QR code, perspective-warp the bubble grid via the 4 fiducials, grade the bubbles deterministically, verify/override any ambiguous marks in the UI, and **commit the MCQ score directly into `useMarksheetsState.ts` and `useSheetSyncQueue.ts`**—immediately updating `MarksheetA4Preview.tsx` and the master Google Sheet.

---

## 2. REQUIRED CODEBASE AUDIT (STEP 0 — DO THIS FIRST)
Read and summarize the exact types and exports from these files before writing code:
- `package.json` & `TECH_STACK.md` (check installed PDF/QR libraries and Node/TS runner setup)
- `AGENTS.md` & `docs/ARCHITECTURE.md` (check coding conventions, offline-first rules, and state boundaries)
- `services/paper/schema.ts` & `services/paper/generator.ts` (inspect MCQ question structure and answer key fields)
- `services/export/pdfExport.ts` & `components/PaperPanel.tsx` (inspect how exam papers are currently exported)
- `services/marksheet/types.ts`, `services/marksheet/calculations.ts`, & `components/marksheets/useMarksheetsState.ts` (inspect how subject scores are stored, keyed by GR number, and recalculated)
- `components/records/useStudentRecords.ts` & `services/identityNormalization.ts` (inspect student object fields: GR number, name, father's name, class, section)
- `hooks/useSheetSyncQueue.ts` (inspect how offline mutations are queued for Google Sheets)
- `components/navigation/AppViewRouter.tsx` & `components/navigation/AppSidebar.tsx` (inspect route registration)
- `scripts/unit-tests.ts` & `scripts/wiring-audit.mjs` (inspect how unit tests and route wiring are verified)

---

## 3. STAGE-BY-STAGE IMPLEMENTATION & VERIFICATION PLAN

### STAGE 1: OMR Data Schema & Deterministic A4 Bubble Sheet PDF Generator
**Goal:** Generate a print-ready A4 OMR PDF from any generated exam paper's MCQ section, embedding the answer key and exam metadata in a QR code alongside 4 corner fiducial squares.

**Files to Create:**
- `services/omr/types.ts`
  - Define `OmrQrPayload` (`v: 1`, `pid`: paperId, `cls`: classId, `sub`: subject, `n`: questionCount, `key`: string e.g. `"ABCD..."`, `gr?`: optional pre-assigned student GR number).
  - Define `OmrGridGeometry` (exact millimeter coordinates on A4 `210mm x 297mm` for the 4 corner fiducials, QR box, optional GR bubble grid, and `(questionIndex, optionIndex)` bubble centers).
  - Define `OmrScanResult` (`grNumber`, `studentName?`, `rawAnswers`: `('A'|'B'|'C'|'D'|'BLANK'|'MULTI')[]`, `score`, `total`, `confidenceMap`, `flaggedQuestions: number[]`).
- `services/omr/layoutGeometry.ts`
  - Pure deterministic math function `computeOmrGeometry(questionCount: number, hasGrGrid: boolean): OmrGridGeometry`.
  - Both the PDF generator and the Vision Engine MUST import this single geometry source of truth so coordinate drift is impossible.
- `services/omr/omrPdfGenerator.ts`
  - Uses the repo's existing PDF library (verify in `package.json`) + lightweight QR encoder (`qr` or `qrcode`).
  - Supports two modes:
    1. **Class Batch Mode (Recommended):** Takes `StudentRecord[]` from `useStudentRecords.ts` and generates a single multi-page A4 PDF where each page is pre-printed with the student's Name, Father's Name, Class, GR Number, and a personalized QR code containing `"gr"`.
    2. **Blank Template Mode:** Generates a single A4 sheet with a 4-digit GR bubble grid for walk-in/unregistered testing.
  - Draws 4 high-contrast black square fiducial markers (`10mm x 10mm`) at fixed corner offsets.

**Files to Modify:**
- `components/PaperPanel.tsx`: Add an **"Export OMR Sheet (A4 PDF)"** button alongside existing paper exports, allowing the teacher to choose "Batch for Class (Pre-filled GR)" or "Blank Sheet".

**Stage 1 Verification Gate:**
- Create `scripts/unit/omrGeometryAndPdf.test.ts` and register it in `scripts/unit-tests.ts`.
- **Tests must verify:**
  1. `computeOmrGeometry(20, false)` and `computeOmrGeometry(50, true)` produce non-overlapping bubble coordinates strictly inside A4 printable margins.
  2. `OmrQrPayload` round-trip serialization/deserialization preserves `pid`, `cls`, `sub`, `n`, `key`, and `gr`.
  3. Generated PDF byte buffer is valid (`%PDF-`) and contains the expected page count matching the filtered class student roster.
- Run `npx tsx scripts/unit-tests.ts` — MUST PASS 100% before Stage 2.

---

### STAGE 2: Pure-TypeScript Camera Vision & Deterministic Bubble Grading Engine
**Goal:** Build a fast, offline-first image processing pipeline that takes an HTML5 `ImageData` frame, decodes the QR payload, detects the 4 corner fiducials, applies perspective homography, and grades every bubble.

**Files to Create:**
- `services/omr/homography.ts`
  - Pure TypeScript 4-point projective transformation (solving the $8 \times 8$ linear system via Gaussian elimination) mapping canonical A4 millimeter coordinates `(x_mm, y_mm)` directly to camera pixel coordinates `(u, v)`.
- `services/omr/visionEngine.ts`
  - Step 1: Decode QR code from `ImageData` using `jsQR` (or `qr/decode.js`) to extract `OmrQrPayload`.
  - Step 2: Locate the 4 corner fiducial black squares using adaptive luminance thresholding and connected-component / corner-region centroid search.
  - Step 3: Map every bubble center from `computeOmrGeometry()` into image pixel space via `homography.ts`.
  - Step 4: Sample circular neighborhood pixel darkness vs. local paper background luminance (illumination-invariant relative darkness ratio).
  - Step 5: Classify each question row:
    - Single bubble exceeds fill threshold (`> 0.45` relative darkness and clear margin over second-darkest) -> `'A' | 'B' | 'C' | 'D'`.
    - Zero bubbles exceed threshold -> `'BLANK'` (flagged for review).
    - Two or more bubbles exceed threshold -> `'MULTI'` (marked incorrect, flagged for review).
  - Step 6: Compare `rawAnswers` against `payload.key` to compute exact `score` and `total`.

**Stage 2 Verification Gate:**
- Create `scripts/unit/omrVisionEngine.test.ts` and register it in `scripts/unit-tests.ts`.
- **Tests must verify:**
  1. **Synthetic Clean Sheet Test:** Render a synthetic `ImageData` bitmap using `computeOmrGeometry()` with known filled bubbles, run `gradeOmrImageData()`, and verify 100% exact score accuracy.
  2. **Perspective Skew & Lighting Test:** Apply artificial rotation/skew (e.g., 12-degree tilt + uneven brightness gradient) to the synthetic bitmap and verify fiducial detection + homography still achieves 100% bubble accuracy.
  3. **Edge-Case Detection Test:** Verify double-bubbled rows are flagged as `'MULTI'` (0 marks) and empty rows are flagged as `'BLANK'`.
- Run `npx tsx scripts/unit-tests.ts` — MUST PASS 100% before Stage 3.

---

### STAGE 3: Marksheet & Google Sheets Sync Bridge
**Goal:** Connect verified `OmrScanResult` objects directly into `PHSSJ-Portal`'s existing marksheet state and offline sync queue without duplicate storage logic.

**Files to Create:**
- `services/omr/marksheetBridge.ts`
  - Accepts `(scanResult: OmrScanResult, qrPayload: OmrQrPayload)`.
  - Normalizes `scanResult.grNumber` using `services/identityNormalization.ts` and resolves the student record from `useStudentRecords` / local storage.
  - Writes the MCQ marks into the matching Class + Subject + Term entry in `services/marksheet/storage.ts` / `useMarksheetsState.ts`, triggering `services/marksheet/calculations.ts` to recompute totals, percentages, and grades.
  - Enqueues the marks update into `hooks/useSheetSyncQueue.ts` so Google Sheets syncs automatically when online.
  - Prevents accidental silent overwrites: if a non-zero score already exists for that student + subject, returns a `conflict` status so the UI asks for confirmation before overwriting.

**Stage 3 Verification Gate:**
- Create `scripts/unit/omrMarksheetBridge.test.ts` and register it in `scripts/unit-tests.ts`.
- **Tests must verify:**
  1. Valid scan result updates the exact student's subject marks in marksheet storage and triggers accurate total/percentage recalculation via `services/marksheet/calculations.ts`.
  2. GR number normalization (`"01042"` vs `"1042"`) resolves to the same student record without creating duplicates.
  3. Existing score conflict detection triggers properly and preserves previous marks until explicitly confirmed.
  4. Sync mutation is properly enqueued in `useSheetSyncQueue.ts`.
- Run `npx tsx scripts/unit-tests.ts` — MUST PASS 100% before Stage 4.

---

### STAGE 4: `OmrScannerView.tsx` UI & End-to-End Portal Wiring
**Goal:** Build a clean, mobile-friendly camera scanner view integrated into the portal navigation and marksheet toolbar.

**Files to Create:**
- `components/omr/OmrScannerView.tsx`
  - Live camera viewfinder (`getUserMedia` rear camera) + "Upload Sheet Photo" fallback input (for testing on desktop or scanning photos from gallery).
  - Real-time canvas overlay drawing:
    - Detected QR badge (Subject, Class, Student Name & GR).
    - Green corner locks on the 4 fiducials.
    - Color-coded circles over every bubble: Green (correct), Red (wrong), Amber (blank/double-marked).
  - Interactive Bubble Override Strip: Clicking any question pill (`Q1`–`Qn`) lets the teacher manually toggle `A / B / C / D / Blank` if a student erased poorly.
  - **"Save to Marksheet"** button (commits via `marksheetBridge.ts` and triggers a `Toast` confirmation) + **"Batch Scan Queue"** counter showing how many students in the class have been scanned vs. remaining.

**Files to Modify:**
- `components/navigation/AppViewRouter.tsx` & `components/navigation/AppSidebar.tsx`: Register `'omr-scanner'` route.
- `components/marksheets/MarksheetToolbar.tsx`: Add a **"Scan OMR"** button that opens `OmrScannerView` pre-filtered to the active class and subject.

**Stage 4 Final End-to-End Verification Gate:**
1. Run `npx tsx scripts/unit-tests.ts` (all existing + new OMR unit tests pass).
2. Run `node scripts/wiring-audit.mjs` (verify no broken imports, routes, or dead links).
3. Run `npm run build` (verify clean TypeScript compilation and Vite production bundle with zero errors).
4. Execute an end-to-end integration test (`scripts/unit/omrEndToEnd.test.ts`) simulating:
   `Paper Schema JSON` -> `Generate OMR PDF & Geometry` -> `Render Synthetic Filled Student Sheet` -> `Vision Engine Grade` -> `Marksheet Bridge Commit` -> `Verify Final Marksheet Total & Grade`.

/**
 * exportService.ts — DOCX / PDF export for lesson plans and exam papers.
 *
 * Decomposed into modular sub-modules in `./export/`:
 *   - `docxHelpers.ts`: TextRun / markdown / equation parsing and page layout constants
 *   - `docxLessonPlan.ts`: Lesson plan DOCX generation (single and bulk)
 *   - `docxExamPaper.ts`: Exam paper DOCX generation with two-column option layout
 *   - `pdfExport.ts`: pdfMake generation for lesson plans and exam papers
 */
export * from './export/index';

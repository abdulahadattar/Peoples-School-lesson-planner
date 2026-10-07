/**
 * geminiService.ts — Gemini API caller, key rotation, and lesson plan generation.
 *
 * Decomposed into modular sub-modules in `./gemini/`:
 *   - `types.ts`: Model chains, callbacks, retry options
 *   - `client.ts`: Key pool, cooldown, rotation, and direct REST API caller
 *   - `pdfDownloader.ts`: PDF fetcher and encoding for prompt context
 *   - `planGen.ts`: Lesson plan JSON generation and JSON parser
 */
export * from './gemini/index';

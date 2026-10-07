/**
 * Exam Paper Generation & Revision Service
 *
 * Decomposed into modular domain submodules in `./paper/`:
 *   - `schema.ts`: Gemini JSON schema specifications for papers & single questions
 *   - `helpers.ts`: Curriculum lookups, mark distributions, difficulty descriptions
 *   - `generator.ts`: Paper generation, revision, and single question regeneration
 */

export * from './paper/schema';
export * from './paper/helpers';
export * from './paper/generator';

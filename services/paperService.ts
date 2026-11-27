/**
 * Exam Paper Generation, Verification & Revision Service
 *
 * Decomposed into modular domain submodules in `./paper/`:
 *   - `schema.ts`: Gemini JSON schema specifications for papers & single questions
 *   - `helpers.ts`: Curriculum lookups, mark distributions, difficulty descriptions
 *   - `generator.ts`: Paper generation, revision, and single question regeneration
 *   - `paperAuditor.ts`: Closed-loop PDF + Word build inspection & AI refinement
 */

export * from './paper/schema';
export * from './paper/helpers';
export * from './paper/generator';
export * from './paper/paperAuditor';
export * from './paper/paperQualityRules';
export * from './paper/buildInspector';

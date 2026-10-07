/**
 * Shared (cross-teacher, cross-device) store for student-record edits that have
 * not reached Google Sheets yet.
 *
 * Decomposed into modular domain submodules in `./sharedRecords/`:
 *   - `types.ts`: Core interfaces, ID normalization, error reporting, author derivation
 *   - `applyEdits.ts`: Overlay layers over base Google Sheet records
 *   - `repository.ts`: Live snapshot subscriptions, publish, mark, and remove operations
 */

export * from './sharedRecords/types';
export * from './sharedRecords/applyEdits';
export * from './sharedRecords/repository';

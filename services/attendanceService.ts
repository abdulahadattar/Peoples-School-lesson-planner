/**
 * Attendance Service for Peoples Higher Secondary School Jamshoro (PHSSJ).
 *
 * Decomposed into modular domain submodules in `./attendance/`:
 *   - `types.ts`: Core data structures, enrollment defaults, and in-charge normalization
 *   - `calculations.ts`: Dynamic enrollment, row calculations, percentages, and summaries
 *   - `repository.ts`: Local and Firestore attendance storage and retrieval
 *   - `csvExport.ts`: CSV report export utility
 */

export * from './attendance/types';
export * from './attendance/calculations';
export * from './attendance/repository';
export * from './attendance/csvExport';

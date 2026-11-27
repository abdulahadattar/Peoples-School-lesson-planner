/**
 * School Configuration Service for Peoples Higher Secondary School Jamshoro (PHSSJ).
 *
 * Decomposed into modular domain submodules in `./schoolConfig/`:
 *   - `types.ts`: Core interfaces for period timings, class configs, and school settings
 *   - `defaults.ts`: Roster defaults, subject allocations, and config sanitization
 *   - `repository.ts`: Local and Firestore config retrieval, persistence, and live subscriptions
 */

export * from './schoolConfig/types';
export * from './schoolConfig/defaults';
export * from './schoolConfig/repository';

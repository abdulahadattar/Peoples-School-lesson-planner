/**
 * School Configuration Service for Peoples Higher Secondary School Jamshoro (PHSSJ).
 *
 * Canonical single source of truth decomposed into modular domain submodules in `./schoolConfig/`:
 *   - `types.ts`: Core interfaces for period timings, class structure, and school settings
 *   - `classStructure.ts`: Unified grade/section/room/capacity/advisor resolution
 *   - `timetableSeed.ts`: Timetable baseline seed, bell timing application, and unified resolver
 *   - `defaults.ts`: Initial seed configuration and safe sanitization
 *   - `store.ts`: Shared reactive in-memory & localStorage snapshot across portal modules
 *   - `repository.ts`: Cloud and local config retrieval, persistence, and live subscriptions
 */

export * from './schoolConfig/types';
export * from './schoolConfig/classStructure';
export * from './schoolConfig/timetableSeed';
export * from './schoolConfig/defaults';
export * from './schoolConfig/store';
export * from './schoolConfig/repository';

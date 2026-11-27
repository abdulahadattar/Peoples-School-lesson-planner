/**
 * Timetable sheet layout detector facade.
 *
 * Decomposed into modular components in `./timetable/layout/`:
 *   - `types.ts`: Sheet layout interfaces and token constants
 *   - `cellUtils.ts`: Grid and cell reading/coordinate helpers
 *   - `titleParser.ts`: Class and teacher title parsing
 *   - `detectLayout.ts`: Primary sheet structure detection algorithm
 */
export * from './timetable/layout/index';

/**
 * timetableSheetWriter.ts — WRITE PATH (app -> Google Sheet) for the timetable.
 *
 * Decomposed into modular sub-modules in `./timetableSheetWriter/`:
 *   - `types.ts`: Write plan, skip, guard, and error interfaces
 *   - `diffPlanner.ts`: Pure diff planner, period row mapper, normalization
 *   - `batchGrouping.ts`: Request chunking and safety guard verification
 *   - `executor.ts`: Network executor, grid fetcher, apply and sync wrappers
 */
export * from './timetableSheetWriter/index';

/**
 * timetableSheetService.ts — READ PATH (Google Sheet -> app).
 *
 * Decomposed into modular sub-modules in `./timetableSheetService/`:
 *   - `types.ts`: Sheet period, class entry, snapshot, and diff interfaces
 *   - `timeUtils.ts`: Clock arithmetic, time string normalization, regexes
 *   - `layoutResolver.ts`: Header scanner and period row layout resolution
 *   - `tabFetcher.ts`: Cached CSV fetcher and whole-sheet snapshot builder
 *   - `merger.ts`: Diff detector and local timetable merge overlay
 */
export * from './timetableSheetService/index';

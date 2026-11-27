/**
 * Google Sheets Service for Peoples Higher Secondary School Jamshoro (PHSSJ).
 *
 * Decomposed into modular components in `./sheets/`:
 *   - `types.ts`: Core interfaces, IDs, URLs, visible columns definition
 *   - `rowMapping.ts`: RFC4180 parser, row <-> student mapping, column boundaries
 *   - `errorClassification.ts`: Google Sheets write error and sync diagnostics
 *   - `fetcher.ts`: IndexedDB & server proxy cached sheet fetchers
 *   - `batchWriter.ts`: Batch update, atomic row writer, attendance sync
 *   - `csvExport.ts`: CSV report file generation
 */
export * from './sheets/index';

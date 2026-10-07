/**
 * Document Archive & Verification Service
 * Facade aggregating modular sub-services for student document processing,
 * NADRA B-Form/CNIC recognition, and Google Sheet reconciliation.
 */

export * from './documentArchive/constants.js';
export * from './documentArchive/nameMatching.js';
export * from './documentArchive/store.js';
export * from './documentArchive/imageProcessing.js';
export * from './documentArchive/aiVision.js';
export * from './documentArchive/discrepancies.js';
export * from './documentArchive/studentMatching.js';
export * from './documentArchive/jobProcessor.js';
export * from './documentArchive/documentActions.js';

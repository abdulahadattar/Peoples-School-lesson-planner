/**
 * Student Document Archiving & AI Verification Types
 */

export type DocumentClassificationType =
  | 'STUDENT_PHOTO'
  | 'B_FORM'
  | 'FATHER_CNIC_FRONT'
  | 'FATHER_CNIC_BACK'
  | 'STUDENT_PROFILE_FORM'
  | 'MARKS_CERTIFICATE'
  | 'BIRTH_CERTIFICATE'
  | 'SCHOOL_LEAVING_CERTIFICATE'
  | 'ADMISSION_FORM'
  | 'IGNORED_NOISE'
  | 'OTHER_UNCLASSIFIED';

export interface ExtractedStudentInfo {
  grNo?: string;
  studentName?: string; // English
  studentNameUrdu?: string;
  fatherName?: string; // English
  fatherNameUrdu?: string;
  bFormNo?: string; // Normalized 13 digits: XXXXX-XXXXXXX-X
  fatherCnic?: string; // Normalized 13 digits: XXXXX-XXXXXXX-X
  dob?: string; // DD-MM-YYYY
  gender?: 'Male' | 'Female' | string;
  religion?: string;
  previousSchool?: string;
  classAdmitted?: string;
  admissionDate?: string;
  address?: string;
  notes?: string;
}

export type DiscrepancySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DocumentDiscrepancy {
  id: string;
  grNo: string;
  studentName: string;
  fatherName?: string;
  currentClass?: string;
  field: 'bFormNo' | 'parentCnic' | 'studentName' | 'fatherName' | 'dob' | 'grNo' | 'missing' | 'orientation';
  fieldName: string;
  sheetValue: string;
  extractedValue: string;
  severity: DiscrepancySeverity;
  message: string;
  documentId?: string;
  documentUrl?: string;
  documentFilename?: string;
  documentClassification?: DocumentClassificationType;
  isDismissed?: boolean;
  resolvedAt?: string;
}

export interface StudentDocumentRecord {
  id: string; // unique hash or id
  jobId: string;
  grNo: string;
  bundleId?: string; // Links pages from the same source PDF / student bundle
  sourceFilename?: string;
  pageNumber?: number;
  classId?: string; // e.g. "IX", "X"
  originalFilename: string;
  filename: string; // saved filename on server
  url: string; // relative url to serve image
  fileHash: string; // SHA-256 for deduplication
  fileSizeBytes: number;
  width?: number;
  height?: number;
  rotationApplied: 0 | 90 | 180 | 270;
  isBlackAndWhite: boolean;
  classification: DocumentClassificationType;
  classificationConfidence: number; // 0.0 - 1.0
  extractedData: ExtractedStudentInfo;
  discrepancies: DocumentDiscrepancy[];
  status: 'verified' | 'flagged' | 'manual_review' | 'duplicate';
  isDuplicateOf?: string;
  processedAt: string;
}

export interface DocumentBundle {
  bundleId: string;
  jobId: string;
  sourceFilename: string;
  pageCount: number;
  pagesProcessed: number;
  initialGrNo: string;
  resolvedGrNo?: string;
  documentIds: string[];
  combinedExtractedData: ExtractedStudentInfo;
  matchScore?: number;
  matchReason?: string;
  matchedStudent?: any;
}

export interface StudentDossier {
  grNo: string;
  studentName: string;
  fatherName: string;
  currentClass: string;
  section: string;
  bFormNo: string;
  parentCnic: string;
  dob: string;
  avatarUrl?: string;
  documents: StudentDocumentRecord[];
  allFlags: DocumentDiscrepancy[];
  hasMissingDocuments: boolean;
  missingTypes: DocumentClassificationType[];
  lastUpdated: string;
}

export interface JobLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: 'UPLOAD' | 'PDF_EXTRACT' | 'IMAGE_OPTIMIZE' | 'AI_VISION' | 'NADRA_PARSE' | 'DOSSIER_SYNC' | 'COMPLETE' | 'ERROR';
  filename?: string;
  grNo?: string;
  message: string;
  details?: string;
  executionTimeMs?: number;
}

export interface JobFileItem {
  id: string;
  originalFilename: string;
  savedFilename?: string;
  grNo: string;
  fileSizeBytes: number;
  stage: 'queued' | 'extracting' | 'optimizing' | 'ai_vision' | 'saving' | 'completed' | 'failed' | 'duplicate';
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'duplicate';
  progressPercent: number;
  classification?: DocumentClassificationType;
  classificationConfidence?: number;
  rotationApplied?: number;
  extractedFieldsCount?: number;
  extractedData?: ExtractedStudentInfo;
  discrepancies?: DocumentDiscrepancy[];
  url?: string;
  error?: string;
  aiModelUsed?: string;
  processedAt?: string;
  executionTimeMs?: number;
}

export interface BatchProcessingJob {
  id: string;
  totalFiles: number;
  processedFiles: number;
  remainingFiles: number;
  flaggedCount: number;
  duplicateCount: number;
  failedCount?: number;
  successCount?: number;
  status: 'uploading' | 'processing' | 'completed' | 'paused' | 'failed';
  currentStage?: string;
  currentStageDescription?: string;
  currentFile?: string;
  error?: string;
  logs?: JobLogEntry[];
  files?: JobFileItem[];
  startedAt: string;
  completedAt?: string;
}

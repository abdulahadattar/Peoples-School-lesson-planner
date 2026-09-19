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

export interface ExtractedChildRecord {
  entryNo?: number;
  childNameEnglish?: string;
  childNameSindhi?: string;
  childNameUrdu?: string;
  bFormNo?: string;
  dob?: string;
  gender?: 'Male' | 'Female' | string;
  fatherNameEnglish?: string;
  fatherNameSindhi?: string;
  fatherCnic?: string;
  motherNameSindhi?: string;
  motherCnic?: string;
  hasTickMark?: boolean;
  isTargetStudent?: boolean;
}

export interface ExtractedStudentInfo {
  grNo?: string;
  studentName?: string; // English
  studentNameUrdu?: string;
  studentNameSindhi?: string; // Sindhi (سنڌي) script
  fatherName?: string; // English
  fatherNameUrdu?: string;
  fatherNameSindhi?: string; // Sindhi (سنڌي) script
  applicantName?: string; // On B-Form / CRC: Applicant (درخواست گذار) at top is Father/Mother
  applicantCnic?: string; // On B-Form / CRC: Applicant CNIC
  children?: ExtractedChildRecord[]; // On B-Form / CRC: All children listed in family table
  cardholderName?: string; // On CNIC: Name of cardholder (student's Father on Father CNIC)
  cardholderFatherName?: string; // On CNIC: Father Name of cardholder (student's Paternal Grandfather on Father CNIC)
  paternalGrandfatherName?: string; // Father's Father printed on Father's CNIC
  caste?: string; // Extracted caste / tribe / surname (e.g. Brohi, Baloch, Khetran, Memon, Chandio, etc.)
  bFormNo?: string; // Normalized 13 digits: XXXXX-XXXXXXX-X
  fatherCnic?: string; // Normalized 13 digits: XXXXX-XXXXXXX-X
  dob?: string; // DD-MM-YYYY
  gender?: 'Male' | 'Female' | string;
  religion?: string;
  hasEnglishText?: boolean; // True if document has printed English names; False if Urdu/Sindhi script only
  previousSchool?: string;
  classAdmitted?: string;
  admissionDate?: string;
  address?: string;
  notes?: string;
  marksheetDetails?: {
    rollNo?: string;
    seatNo?: string;
    totalMarks?: number;
    obtainedMarks?: number;
    percentage?: number;
    grade?: string;
    examYear?: string;
    board?: string;
    resultStatus?: string;
  };
  bFormValidation?: {
    isValidFormat?: boolean;
    issue?: string;
    cleanNumber?: string;
    provinceName?: string;
    isValid?: boolean;
    digits?: string;
    formatted?: string;
    provinceCode?: number;
  };
}

export type DiscrepancySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CandidateStudentMatch {
  grNo: string;
  studentName: string;
  fatherName: string;
  currentClass: string;
  section?: string;
  bFormNo?: string;
  parentCnic?: string;
  score: number; // 0 - 100
  evidence: string[];
  reasons: string;
}

export interface DocumentDiscrepancy {
  id: string;
  grNo: string;
  studentName: string;
  fatherName?: string;
  currentClass?: string;
  field:
    | 'bFormNo'
    | 'parentCnic'
    | 'studentName'
    | 'fatherName'
    | 'dob'
    | 'grNo'
    | 'caste'
    | 'familyHierarchy'
    | 'bFormValidation'
    | 'missing'
    | 'orientation';
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
  incompleteOcr?: boolean;
  suggestedAction?: 'update_sheet' | 'merge_caste' | 'enrich_full_name' | 'verify_hierarchy' | 'reformat_bform' | 'link_gr';
  suggestedCorrection?: {
    field: string;
    newValue: string;
    reason: string;
    previousValue?: string;
  };
  rankedMatches?: CandidateStudentMatch[];
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
  caste?: string;
  paternalGrandfatherName?: string;
  studentNameSindhi?: string;
  fatherNameSindhi?: string;
  hasEnglishText?: boolean;
  avatarUrl?: string;
  documents: StudentDocumentRecord[];
  allFlags: DocumentDiscrepancy[];
  hasMissingDocuments: boolean;
  missingTypes: DocumentClassificationType[];
  dossierConfidence?: number; // 0 - 100
  confidenceTier?: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: string[];
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

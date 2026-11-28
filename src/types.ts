export type DocumentCategory =
  | 'student_photo'
  | 'b_form'
  | 'father_cnic'
  | 'marksheet'
  | 'admission_form'
  | 'other_document';

export type ArchiveDocumentStatus =
  | 'linked'
  | 'multi_sibling_linked'
  | 'flagged_misfiled'
  | 'flagged_ambiguous'
  | 'skipped_portrait';

export type PipelineStatus =
  | 'idle'
  | 'scanning_drive'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed';

export interface PreClassifierResult {
  classification: 'portrait' | 'document';
  confidence: number;
  faceCount: number;
  largestFaceAreaRatio: number;
  textDensityScore: number;
  lineBandVariance: number;
  edgeDensity: number;
  paperPeakRatio: number;
  reasoning: string;
  detectionEngine: 'face-api+heuristics' | 'heuristics-only';
  processingMs: number;
}

export interface StudentRecord {
  grNumber: string;
  fullName: string;
  fatherName: string;
  fatherCnic: string;
  bFormNumber?: string;
  dateOfBirth: string;
  className: string;
  section?: string;
  gender: 'Male' | 'Female' | 'Other';
  portraitDocumentId?: string;
  createdAt: string;
}

export interface ExtractedChildEntry {
  fullName: string;
  bFormNumber?: string;
  dateOfBirth?: string;
  gender?: string;
}

export interface DocumentOcrExtraction {
  documentType: 'b_form' | 'father_cnic' | 'marksheet' | 'admission_form' | 'other_document';
  studentName?: string;
  grNumberDetected?: string;
  className?: string;
  fatherName?: string;
  fatherCnic?: string;
  dateOfBirth?: string;
  bFormNumber?: string;
  children: ExtractedChildEntry[];
  academicDetails?: {
    examName?: string;
    year?: string;
    totalMarks?: string;
    obtainedMarks?: string;
    percentage?: string;
    grade?: string;
  };
  confidence: number;
  summary: string;
}

export interface SiblingMatchLink {
  grNumber: string;
  studentName: string;
  className: string;
  matchReason: string;
  confidence: number;
}

export interface ArchiveDocument {
  id: string;
  packetId: string;
  source: 'google_drive' | 'local_upload';
  driveFileId?: string;
  folderName: string;
  fileName: string;
  pageIndex: number;
  totalPages: number;
  mimeType: string;
  category: DocumentCategory;
  colorMode: 'original_color' | 'high_contrast_greyscale';
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  imageUrl: string;
  preClassification: PreClassifierResult;
  ocrSkipped: boolean;
  ocrData?: DocumentOcrExtraction;
  primaryFolderGr?: string;
  linkedGrNumbers: string[];
  siblingMatches: SiblingMatchLink[];
  status: ArchiveDocumentStatus;
  flagReason?: string;
  createdAt: string;
}

export interface BatchPacket {
  id: string;
  folderName: string;
  driveFolderId?: string;
  parsedGrNumber?: string;
  primaryStudentName?: string;
  packetClues: {
    fatherName?: string;
    fatherCnic?: string;
    childNames: string[];
    detectedGrNumbers: string[];
  };
  documentIds: string[];
  processedCount: number;
  skippedPortraitCount: number;
  flaggedCount: number;
  siblingLinksCreated: number;
  status: 'completed' | 'needs_review';
  createdAt: string;
}

export interface OcrLogEntry {
  id: string;
  timestamp: string;
  packetId: string;
  documentId: string;
  fileName: string;
  stage: 'pre_filter' | 'greyscale_opt' | 'gemini_ocr' | 'packet_resolve' | 'admin_reset';
  outcome:
    | 'skipped_portrait'
    | 'extracted'
    | 'linked'
    | 'multi_sibling_linked'
    | 'flagged'
    | 'error'
    | 'reset';
  aiCostSaved: boolean;
  bytesSaved: number;
  durationMs: number;
  details: string;
}

export interface PipelineCounters {
  totalDiscovered: number;
  queued: number;
  processed: number;
  flagged: number;
  skippedPortraits: number;
  multiSiblingLinks: number;
  bytesSaved: number;
}

export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderName: string;
  folderId: string;
  parsedGrNumber?: string;
}

export interface DrivePacketPlan {
  folderId: string;
  folderName: string;
  parsedGrNumber?: string;
  files: DriveFileEntry[];
}

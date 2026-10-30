import { BatchProcessingJob } from '../../types/documentArchive';

export interface ChunkSession {
  chunks: Record<number, Buffer>;
  totalChunks: number;
  filename: string;
  grNo?: string;
  isZip?: boolean;
  /**
   * FIX-1b: the caller's batch job shell, when the chunked file belongs to a
   * multi-file upload (clientUpload.ts sends `jobId`). ZIPs ignore this — they
   * always ingest into their own self-contained job.
   */
  jobId?: string;
}

export const chunkSessions: Record<string, ChunkSession> = {};

export function getOrCreateChunkSession(
  uploadId: string,
  totalChunks: number,
  filename: string,
  grNo?: string,
  isZip?: boolean,
  jobId?: string
): ChunkSession {
  if (!chunkSessions[uploadId]) {
    chunkSessions[uploadId] = { chunks: {}, totalChunks, filename, grNo, isZip, jobId };
  }
  return chunkSessions[uploadId];
}

export function removeChunkSession(uploadId: string) {
  delete chunkSessions[uploadId];
}

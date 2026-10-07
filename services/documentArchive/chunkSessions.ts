import { BatchProcessingJob } from '../../types/documentArchive';

export interface ChunkSession {
  chunks: Record<number, Buffer>;
  totalChunks: number;
  filename: string;
  grNo?: string;
  isZip?: boolean;
}

export const chunkSessions: Record<string, ChunkSession> = {};

export function getOrCreateChunkSession(
  uploadId: string,
  totalChunks: number,
  filename: string,
  grNo?: string,
  isZip?: boolean
): ChunkSession {
  if (!chunkSessions[uploadId]) {
    chunkSessions[uploadId] = { chunks: {}, totalChunks, filename, grNo, isZip };
  }
  return chunkSessions[uploadId];
}

export function removeChunkSession(uploadId: string) {
  delete chunkSessions[uploadId];
}

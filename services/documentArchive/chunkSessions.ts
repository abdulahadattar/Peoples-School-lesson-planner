import { BatchProcessingJob } from '../../types/documentArchive';

export interface ChunkSession {
  chunks: Record<number, Buffer>;
  totalChunks: number;
  filename: string;
  grNo?: string;
  isZip?: boolean;
  jobId?: string;
  folderName?: string;
  packetId?: string;
  preClassifiedAs?: 'portrait' | 'document';
  aiSkipped?: boolean;
}

export const chunkSessions: Record<string, ChunkSession> = {};

export function getOrCreateChunkSession(
  uploadId: string,
  totalChunks: number,
  filename: string,
  grNo?: string,
  isZip?: boolean,
  jobId?: string,
  meta?: {
    folderName?: string;
    packetId?: string;
    preClassifiedAs?: 'portrait' | 'document';
    aiSkipped?: boolean;
  }
): ChunkSession {
  if (!chunkSessions[uploadId]) {
    chunkSessions[uploadId] = {
      chunks: {},
      totalChunks,
      filename,
      grNo,
      isZip,
      jobId,
      folderName: meta?.folderName,
      packetId: meta?.packetId,
      preClassifiedAs: meta?.preClassifiedAs,
      aiSkipped: meta?.aiSkipped,
    };
  }
  return chunkSessions[uploadId];
}

export function removeChunkSession(uploadId: string) {
  delete chunkSessions[uploadId];
}

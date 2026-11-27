/**
 * Google Drive v3 Client Service for Document Archive Ingestion.
 *
 * Traverses subfolders recursively using the user's client-side OAuth access
 * token (drive.readonly), groups files into folder-level Student Packets, and
 * downloads images/PDFs as File objects for local pre-classification.
 */
import {
  DriveQueueItem,
  parseClientFolderGr,
} from '../../hooks/useDocumentArchive/driveImportState.js';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

function isSupportedScanFile(file: RawDriveFile): boolean {
  if (file.mimeType?.startsWith('image/')) return true;
  if (file.mimeType === 'application/pdf') return true;
  return /\.(jpe?g|png|webp|bmp|pdf)$/i.test(file.name || '');
}

async function listFolderChildren(
  folderId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<RawDriveFile[]> {
  const results: RawDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,size)',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      orderBy: 'folder,name',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_FILES_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });

    if (!res.ok) {
      let msg = `Google Drive request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error?.message) msg = body.error.message;
      } catch {}
      throw new DriveApiError(msg, res.status);
    }

    const data = await res.json();
    if (Array.isArray(data.files)) {
      results.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

export interface DriveDiscoveryResult {
  items: DriveQueueItem[];
  packetsCount: number;
}

/**
 * Discovers all image and PDF files under `rootFolderId`, assigning each subfolder
 * as a cohesive Student Packet (`packetId = pkt_${folderId}`) with parsed GR number.
 */
export async function discoverDriveFolderTree(
  rootFolderId: string,
  accessToken: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (discoveredCount: number, folderLabel: string) => void;
  }
): Promise<DriveDiscoveryResult> {
  const items: DriveQueueItem[] = [];
  const packetIds = new Set<string>();

  interface WalkEntry {
    folderId: string;
    folderName: string;
    inheritedGrNo: string;
    depth: number;
  }

  const queue: WalkEntry[] = [
    { folderId: rootFolderId, folderName: 'DriveRoot', inheritedGrNo: '', depth: 0 },
  ];
  const visitedFolders = new Set<string>();

  while (queue.length > 0) {
    if (options?.signal?.aborted) break;
    const current = queue.shift()!;
    if (visitedFolders.has(current.folderId)) continue;
    visitedFolders.add(current.folderId);

    const children = await listFolderChildren(current.folderId, accessToken, options?.signal);

    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) {
        const ownGr = parseClientFolderGr(child.name);
        queue.push({
          folderId: child.id,
          folderName: child.name,
          inheritedGrNo: ownGr || current.inheritedGrNo,
          depth: current.depth + 1,
        });
        continue;
      }

      if (!isSupportedScanFile(child)) continue;

      const immediateGr = parseClientFolderGr(current.folderName);
      const fileGr = parseClientFolderGr(child.name);
      const parsedFolderGrNo = immediateGr || current.inheritedGrNo || fileGr || '';
      const packetId = `pkt_${current.depth === 0 && parsedFolderGrNo ? `gr_${parsedFolderGrNo}` : current.folderId}`;

      packetIds.add(packetId);
      items.push({
        fileId: child.id,
        name: child.name,
        mimeType: child.mimeType,
        folderId: current.folderId,
        folderName: current.folderName,
        packetId,
        parsedFolderGrNo,
        sizeBytes: child.size ? Number(child.size) : undefined,
      });

      options?.onProgress?.(items.length, current.folderName);
    }
  }

  return {
    items,
    packetsCount: packetIds.size,
  };
}

/**
 * Downloads a Google Drive file binary as a Web `File` object for pre-classification & upload.
 */
export async function downloadDriveFileAsFile(
  item: Pick<DriveQueueItem, 'fileId' | 'name' | 'mimeType'>,
  accessToken: string,
  signal?: AbortSignal
): Promise<File> {
  const url = `${DRIVE_FILES_API}/${encodeURIComponent(item.fileId)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });

  if (!res.ok) {
    let msg = `Failed to download "${item.name}" from Google Drive (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) msg = errJson.error.message;
    } catch {}
    throw new DriveApiError(msg, res.status);
  }

  const blob = await res.blob();
  const mime = item.mimeType || blob.type || 'application/octet-stream';
  return new File([blob], item.name, { type: mime });
}

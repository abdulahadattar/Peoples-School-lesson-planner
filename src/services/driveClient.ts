import type { DriveFileEntry, DrivePacketPlan } from '../types.ts';

export const DEFAULT_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1wfb76a2vKjXy-CaKm70N2ugY0ue_h7zd?usp=sharing';

export function extractDriveFolderId(input: string): string {
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch?.[1]) return idParamMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  throw new Error('Could not extract a valid Google Drive folder ID from the URL.');
}

export function parseGrFromName(name: string): string | undefined {
  const explicit = name.match(/(?:gr[-_\s#]*|^)(\d{3,6})(?:[-_\s]|$)/i);
  if (explicit?.[1]) return explicit[1];
  const digits = name.match(/\b(\d{3,6})\b/);
  return digits?.[1];
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

async function listFolderChildren(
  folderId: string,
  accessToken: string
): Promise<RawDriveFile[]> {
  const results: RawDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      'nextPageToken, files(id, name, mimeType, size)'
    );
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}` +
      `&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      if (resp.status === 401) {
        throw new Error('Google Drive session expired. Please click "Sign in with Google" again.');
      }
      if (resp.status === 404 || resp.status === 403) {
        throw new Error(
          `Cannot access Drive folder (${resp.status}). Ensure your Google account has access to this shared folder.`
        );
      }
      throw new Error(`Drive API error (${resp.status}): ${errBody.slice(0, 180)}`);
    }

    const data = (await resp.json()) as {
      nextPageToken?: string;
      files?: RawDriveFile[];
    };
    if (Array.isArray(data.files)) {
      results.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

async function getFolderMetadata(
  folderId: string,
  accessToken: string
): Promise<{ id: string; name: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    folderId
  )}?fields=id,name&supportsAllDrives=true`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    return { id: folderId, name: `Drive_Folder_${folderId.slice(0, 6)}` };
  }
  const data = (await resp.json()) as { id?: string; name?: string };
  return {
    id: data.id || folderId,
    name: data.name || `Drive_Folder_${folderId.slice(0, 6)}`,
  };
}

export async function scanDriveFolderIntoPackets(
  folderUrlOrId: string,
  accessToken: string
): Promise<{ rootName: string; packets: DrivePacketPlan[] }> {
  const rootId = extractDriveFolderId(folderUrlOrId);
  const rootMeta = await getFolderMetadata(rootId, accessToken);
  const rootChildren = await listFolderChildren(rootId, accessToken);

  const packets: DrivePacketPlan[] = [];
  const rootFiles: DriveFileEntry[] = [];
  const subFolders: RawDriveFile[] = [];

  for (const entry of rootChildren) {
    if (entry.mimeType === 'application/vnd.google-apps.folder') {
      subFolders.push(entry);
    } else if (SUPPORTED_MIME_TYPES.has(entry.mimeType.toLowerCase())) {
      rootFiles.push({
        id: entry.id,
        name: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: Number(entry.size || 0),
        folderName: rootMeta.name,
        folderId: rootMeta.id,
        parsedGrNumber: parseGrFromName(entry.name),
      });
    }
  }

  // Group each subfolder into a dedicated Student Packet
  for (const folder of subFolders) {
    const folderFiles: DriveFileEntry[] = [];
    const queue: Array<{ id: string; name: string }> = [{ id: folder.id, name: folder.name }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = await listFolderChildren(current.id, accessToken);
      for (const child of children) {
        if (child.mimeType === 'application/vnd.google-apps.folder') {
          queue.push({ id: child.id, name: child.name });
        } else if (SUPPORTED_MIME_TYPES.has(child.mimeType.toLowerCase())) {
          folderFiles.push({
            id: child.id,
            name: child.name,
            mimeType: child.mimeType,
            sizeBytes: Number(child.size || 0),
            folderName: folder.name,
            folderId: folder.id,
            parsedGrNumber: parseGrFromName(folder.name) || parseGrFromName(child.name),
          });
        }
      }
    }

    if (folderFiles.length > 0) {
      packets.push({
        folderId: folder.id,
        folderName: folder.name,
        parsedGrNumber: parseGrFromName(folder.name),
        files: folderFiles,
      });
    }
  }

  // Group any loose root files by parsed GR number or put in a root batch packet
  if (rootFiles.length > 0) {
    const groupedByGr = new Map<string, DriveFileEntry[]>();
    for (const file of rootFiles) {
      const key = file.parsedGrNumber ? `GR_${file.parsedGrNumber}` : rootMeta.name;
      const list = groupedByGr.get(key) || [];
      list.push(file);
      groupedByGr.set(key, list);
    }
    for (const [groupName, files] of groupedByGr.entries()) {
      packets.push({
        folderId: rootMeta.id,
        folderName: groupName,
        parsedGrNumber: parseGrFromName(groupName),
        files,
      });
    }
  }

  return {
    rootName: rootMeta.name,
    packets,
  };
}

export async function downloadDriveFileBlob(
  fileId: string,
  accessToken: string
): Promise<Blob> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media&supportsAllDrives=true`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Failed to download Drive file ${fileId} (${resp.status})`);
  }
  return resp.blob();
}

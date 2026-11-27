import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';
import {
  DEFAULT_DRIVE_FOLDER_ID,
  DEFAULT_DRIVE_FOLDER_URL,
  extractDriveFolderId,
  parseClientFolderGr,
  createInitialDriveImportState,
  beginDriveDiscovery,
  seedDriveQueue,
  recordDriveFileOutcome,
  markDrivePaused,
  resumeDriveRun,
  markDriveStopped,
  completeDriveRun,
} from '../../hooks/useDocumentArchive/driveImportState';
import { setAdminTokenVerifierForTests } from '../../services/auth/verifyAdminToken';

type Harness = {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
};

async function createSamplePortraitJpeg(): Promise<Buffer> {
  const w = 200;
  const h = 260;
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const nx = x / w;
      const ny = y / h;
      const dx = (nx - 0.5) / 0.22;
      const dy = (ny - 0.38) / 0.23;
      const inFace = dx * dx + dy * dy <= 1;
      raw[idx] = inFace ? 215 : 58;
      raw[idx + 1] = inFace ? 160 : 94;
      raw[idx + 2] = inFace ? 128 : 146;
      raw[idx + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).jpeg({ quality: 90 }).toBuffer();
}

export async function runDriveImportAndResetTests(h: Harness) {
  const { describe, it, itAsync, eq } = h;

  describe('driveImportState (URL parsing & Pause/Stop state machine)');

  it('extracts Google Drive folder ID from sharing URL and raw ID', () => {
    eq(extractDriveFolderId(DEFAULT_DRIVE_FOLDER_URL), DEFAULT_DRIVE_FOLDER_ID);
    eq(extractDriveFolderId(`https://drive.google.com/drive/u/0/folders/${DEFAULT_DRIVE_FOLDER_ID}`), DEFAULT_DRIVE_FOLDER_ID);
    eq(extractDriveFolderId(DEFAULT_DRIVE_FOLDER_ID), DEFAULT_DRIVE_FOLDER_ID);
    eq(extractDriveFolderId('https://example.com/not-drive'), '');
  });

  it('parses browser-safe GR folder labels consistently with server parser', () => {
    eq(parseClientFolderGr('1299_images'), '1299');
    eq(parseClientFolderGr('13 Mansoor Lashari'), '13');
    eq(parseClientFolderGr('GR-06'), '06');
    eq(parseClientFolderGr('2025'), '');
    eq(parseClientFolderGr('images'), '');
  });

  it('transitions cleanly through Start -> Running -> Pause -> Resume -> Complete & Stop', () => {
    let s = createInitialDriveImportState();
    s = beginDriveDiscovery(s, DEFAULT_DRIVE_FOLDER_ID);
    eq(s.status, 'discovering');
    s = seedDriveQueue(
      s,
      [
        { fileId: 'f1', name: 'p.jpg', mimeType: 'image/jpeg', folderId: 'd1', folderName: '1299_images', packetId: 'pkt_1', parsedFolderGrNo: '1299' },
        { fileId: 'f2', name: 'b.jpg', mimeType: 'image/jpeg', folderId: 'd1', folderName: '1299_images', packetId: 'pkt_1', parsedFolderGrNo: '1299' },
      ],
      1,
      'job1'
    );
    eq(s.status, 'running');
    eq(s.queued, 2);

    s = recordDriveFileOutcome(s, { processedDelta: 1, skippedDelta: 1 });
    eq(s.processed, 1);
    eq(s.skipped, 1);
    eq(s.queued, 1);

    s = markDrivePaused(s);
    eq(s.status, 'paused');
    eq(s.nextIndex, 1);

    s = resumeDriveRun(s);
    eq(s.status, 'running');

    s = recordDriveFileOutcome(s, { processedDelta: 1, flaggedDelta: 1 });
    s = completeDriveRun(s);
    eq(s.status, 'completed');
    eq(s.queued, 0);
    eq(s.flagged, 1);

    const stopped = markDriveStopped(beginDriveDiscovery(createInitialDriveImportState(), DEFAULT_DRIVE_FOLDER_ID));
    eq(stopped.status, 'stopped');
    eq(stopped.queued, 0);
  });

  describe('Server Portrait Skip, Packet Metadata & Admin-Only Reset Endpoint');

  const App = (await import('../../api/index')).default;
  const { DATA_DIR } = await import('../../services/documentArchive/constants');
  const { jobsStore, documentsStore, dossiersStore } = await import('../../services/documentArchive/store');

  const server = http.createServer(App as any);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;

  try {
    await itAsync('skips AI for detected student portrait and saves full color STUDENT_PHOTO', async () => {
      const portraitBuf = await createSamplePortraitJpeg();
      const createRes = await fetch(`${base}/documents/create-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedCount: 1, sourceType: 'drive', driveFolderId: DEFAULT_DRIVE_FOLDER_ID }),
      });
      const { job: created } = await createRes.json();
      const jobId = created.id;

      await fetch(`${base}/documents/upload-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          filename: 'portrait.jpg',
          base64Data: portraitBuf.toString('base64'),
          folderName: '1299_images',
          packetId: 'pkt_drive_1299',
          parsedFolderGrNo: '1299',
        }),
      });

      const finRes = await fetch(`${base}/documents/finalize-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const finData = await finRes.json();
      eq(finData.job.status, 'completed');
      eq(finData.job.skippedCount >= 1, true, 'Portrait should increment skippedCount (0 AI cost)');

      const docs = Object.values(documentsStore);
      const saved = docs.find((d) => d.jobId === jobId);
      eq(Boolean(saved), true, 'Portrait scan record should be persisted');
      eq(saved?.classification, 'STUDENT_PHOTO');
      eq(saved?.grNo, '1299');
      eq(saved?.aiSkipped, true);
      eq(saved?.isBlackAndWhite, false);
    });

    await itAsync('POST /documents/admin-reset enforces 401 -> 403 -> 200 Admin auth and wipes storage', async () => {
      const unauth = await fetch(`${base}/documents/admin-reset`, { method: 'POST' });
      eq(unauth.status, 401);

      setAdminTokenVerifierForTests(async () => null);
      const nonAdmin = await fetch(`${base}/documents/admin-reset`, {
        method: 'POST',
        headers: { Authorization: 'Bearer teacher-token' },
      });
      eq(nonAdmin.status, 403);

      setAdminTokenVerifierForTests(async (tok) =>
        tok === 'valid-admin' ? { uid: 'u_admin', email: 'abdul7762ahad@gmail.com' } : null
      );
      const adminOk = await fetch(`${base}/documents/admin-reset`, {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-admin' },
      });
      eq(adminOk.status, 200);
      const body = await adminOk.json();
      eq(body.ok, true);
      eq(Object.keys(jobsStore).length, 0);
      eq(Object.keys(documentsStore).length, 0);
      eq(Object.keys(dossiersStore).length, 0);
      eq(fs.existsSync(path.join(DATA_DIR, 'GR_1299')), false);
    });
  } finally {
    setAdminTokenVerifierForTests(null);
    server.closeAllConnections?.();
    server.close();
  }
}

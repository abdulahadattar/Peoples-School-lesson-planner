import { useState, useRef, useCallback } from 'react';
import { BatchProcessingJob } from '../../types/documentArchive';
import {
  getAccessToken,
  googleSignIn,
  refreshAccessTokenSilently,
} from '../../services/googleAuth';
import {
  discoverDriveFolderTree,
  downloadDriveFileAsFile,
  DriveApiError,
} from '../../services/documentClient/driveClient';
import {
  formatApiErrorMessage,
  uploadPreparedFileToJob,
} from '../../services/documentClient/clientUpload';
import { fetchJobStatus, stopJob } from '../../services/documentClient/clientQueries';
import { autoLinkDocumentsWithSheet } from '../../services/documentClient/clientCorrections';
import { StudentRecord } from '../../services/googleSheetsService';
import { toUserErrorMessage } from '../../utils/userMessage';
import {
  createInitialDriveImportState,
  setDriveFolderInput,
  beginDriveDiscovery,
  seedDriveQueue,
  setDriveCurrentItem,
  recordDriveFileOutcome,
  markDrivePaused,
  resumeDriveRun,
  markDriveStopped,
  completeDriveRun,
  failDriveRun,
  extractDriveFolderId,
  DriveImportState,
  DriveQueueItem,
} from './driveImportState';

const PACKET_CHUNK_MAX = 6;

function getImportedFileIds(folderId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`phssj_imported_drive_files_${folderId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

function saveImportedFileId(folderId: string, fileId: string) {
  try {
    const set = getImportedFileIds(folderId);
    set.add(fileId);
    localStorage.setItem(`phssj_imported_drive_files_${folderId}`, JSON.stringify(Array.from(set)));
  } catch {}
}

export function clearDriveImportCache(folderId: string) {
  try {
    localStorage.removeItem(`phssj_imported_drive_files_${folderId}`);
  } catch {}
}

interface UseDriveImportOptions {
  sheetRecords: StudentRecord[];
  onActiveJobChange: (job: BatchProcessingJob | null) => void;
  onRefreshArchive: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useDriveImport({
  sheetRecords,
  onActiveJobChange,
  onRefreshArchive,
  showToast,
}: UseDriveImportOptions) {
  const [driveState, setDriveState] = useState<DriveImportState>(() => createInitialDriveImportState());
  const [incrementalSync, setIncrementalSync] = useState(true);
  const stateRef = useRef<DriveImportState>(driveState);
  const incrementalSyncRef = useRef(incrementalSync);
  incrementalSyncRef.current = incrementalSync;

  const pauseRequestedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const commitState = useCallback((updater: (prev: DriveImportState) => DriveImportState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setDriveState(next);
    return next;
  }, []);

  const ensureDriveToken = useCallback(async (forceInteractive: boolean = false): Promise<string> => {
    if (!forceInteractive) {
      const existing = await getAccessToken();
      if (existing) return existing;
      const silent = await refreshAccessTokenSilently();
      if (silent) return silent;
    }
    const authRes = await googleSignIn();
    const token = authRes?.accessToken || (await getAccessToken());
    if (!token) {
      throw new Error('Google Drive authorization is required to read folders and files.');
    }
    return token;
  }, []);

  const waitForJobTerminal = useCallback(async (jobId: string): Promise<BatchProcessingJob | null> => {
    for (let attempt = 0; attempt < 90; attempt++) {
      if (stopRequestedRef.current) return null;
      const job = await fetchJobStatus(jobId);
      if (job) {
        onActiveJobChange(job);
        if (job.status === 'completed' || job.status === 'failed') {
          return job;
        }
      }
      await new Promise((r) => setTimeout(r, 900));
    }
    return fetchJobStatus(jobId);
  }, [onActiveJobChange]);

  const runQueueLoop = useCallback(async (initialToken: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    let token = initialToken;
    let cumulativeSkipped = stateRef.current.skipped;
    let cumulativeFlagged = stateRef.current.flagged;
    let cumulativeDuplicates = stateRef.current.duplicates;

    try {
      while (stateRef.current.nextIndex < stateRef.current.queue.length) {
        if (stopRequestedRef.current) break;
        if (pauseRequestedRef.current) break;

        const startIdx = stateRef.current.nextIndex;
        const queue = stateRef.current.queue;
        const firstItem = queue[startIdx];
        const batchItems: DriveQueueItem[] = [firstItem];

        for (let k = startIdx + 1; k < queue.length && batchItems.length < PACKET_CHUNK_MAX; k++) {
          if (queue[k].packetId !== firstItem.packetId) break;
          batchItems.push(queue[k]);
        }

        const createRes = await fetch('/api/documents/create-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedCount: batchItems.length,
            sourceType: 'drive',
            driveFolderId: stateRef.current.folderId,
          }),
        });
        if (!createRes.ok) {
          throw new Error(formatApiErrorMessage(createRes.status, await createRes.text()));
        }
        const { job: createdJob } = await createRes.json();
        const subJobId = String(createdJob.jobId ?? createdJob.id);
        onActiveJobChange(createdJob);
        commitState((prev) => ({ ...prev, jobId: subJobId }));

        let uploadedInBatch = 0;
        let authPaused = false;

        for (const item of batchItems) {
          if (stopRequestedRef.current || pauseRequestedRef.current) break;
          commitState((prev) => setDriveCurrentItem(prev, item));
          const controller = new AbortController();
          abortControllerRef.current = controller;

          let file: File;
          try {
            file = await downloadDriveFileAsFile(item, token, controller.signal);
          } catch (err: any) {
            if (err?.name === 'AbortError' || stopRequestedRef.current) break;
            if (err instanceof DriveApiError && (err.status === 401 || err.status === 403)) {
              const refreshed = await refreshAccessTokenSilently();
              if (refreshed) {
                token = refreshed;
                file = await downloadDriveFileAsFile(item, token, controller.signal);
              } else {
                pauseRequestedRef.current = true;
                commitState((prev) => ({
                  ...markDrivePaused(prev),
                  errorMessage: 'Google Drive session expired. Reconnect Google and click Resume.',
                }));
                authPaused = true;
                break;
              }
            } else {
              throw err;
            }
          }

          if (stopRequestedRef.current) break;

          const prepOutcome = await uploadPreparedFileToJob(subJobId, {
            file,
            grNo: item.parsedFolderGrNo || undefined,
            folderName: item.folderName,
            packetId: item.packetId,
            parsedFolderGrNo: item.parsedFolderGrNo,
          });
          uploadedInBatch++;
          if (prepOutcome.aiSkipped) cumulativeSkipped++;

          // Save to imported cache so future runs skip this file instantly
          saveImportedFileId(stateRef.current.folderId, item.fileId);

          commitState((prev) =>
            recordDriveFileOutcome(prev, {
              processedDelta: 1,
              skippedDelta: prepOutcome.aiSkipped ? 1 : 0,
            })
          );
        }

        if (uploadedInBatch > 0) {
          const finRes = await fetch('/api/documents/finalize-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: subJobId }),
          });
          if (!finRes.ok) {
            throw new Error(formatApiErrorMessage(finRes.status, await finRes.text()));
          }
          const finData = await finRes.json();
          const finalJob =
            finData?.job?.status === 'completed' || finData?.job?.status === 'failed'
              ? (finData.job as BatchProcessingJob)
              : await waitForJobTerminal(subJobId);

          if (finalJob) {
            onActiveJobChange(finalJob);
            const serverSkipped = Math.max(0, (finalJob.skippedCount || 0) - uploadedInBatch);
            cumulativeSkipped += serverSkipped;
            cumulativeFlagged += finalJob.flaggedCount || 0;
            cumulativeDuplicates += finalJob.duplicateCount || 0;
            commitState((prev) => ({
              ...prev,
              flagged: cumulativeFlagged,
              duplicates: cumulativeDuplicates,
              skipped: cumulativeSkipped,
            }));
          }
        }

        if (authPaused) return;
      }

      if (stopRequestedRef.current) {
        if (stateRef.current.jobId) {
          await stopJob(stateRef.current.jobId).catch(() => false);
        }
        commitState((prev) => markDriveStopped(prev));
        await onRefreshArchive();
        showToast('Google Drive import stopped.', 'info');
        return;
      }

      if (pauseRequestedRef.current) {
        commitState((prev) => markDrivePaused(prev));
        await onRefreshArchive();
        showToast('Google Drive import paused. Click Resume to continue.', 'info');
        return;
      }

      if (sheetRecords.length > 0 && stateRef.current.processed > 0) {
        await autoLinkDocumentsWithSheet(sheetRecords).catch(() => null);
      }
      await onRefreshArchive();
      commitState((prev) => completeDriveRun(prev));
      showToast(
        `Drive import finished: ${stateRef.current.processed} file(s) processed (${stateRef.current.skipped} photo(s) skipped).`,
        'success'
      );
    } catch (err: any) {
      if (stopRequestedRef.current) {
        commitState((prev) => markDriveStopped(prev));
        return;
      }
      const msg = toUserErrorMessage(err, 'Google Drive import failed.');
      commitState((prev) => failDriveRun(prev, msg));
      showToast(msg, 'error');
    } finally {
      abortControllerRef.current = null;
      runningRef.current = false;
    }
  }, [commitState, onActiveJobChange, onRefreshArchive, sheetRecords, showToast, waitForJobTerminal]);

  const setFolderInput = useCallback((urlOrId: string) => {
    commitState((prev) => setDriveFolderInput(prev, urlOrId));
  }, [commitState]);

  const startImport = useCallback(async (forceRescan: boolean = false) => {
    const folderId = extractDriveFolderId(stateRef.current.folderInput);
    if (!folderId) {
      const msg = 'Enter a valid Google Drive folder URL or Folder ID.';
      commitState((prev) => failDriveRun(prev, msg));
      showToast(msg, 'error');
      return;
    }

    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    commitState((prev) => beginDriveDiscovery(prev, folderId));

    try {
      const token = await ensureDriveToken();
      const discoveryController = new AbortController();
      abortControllerRef.current = discoveryController;

      const discovery = await discoverDriveFolderTree(folderId, token, {
        signal: discoveryController.signal,
        onProgress: (count, folderLabel) => {
          commitState((prev) => ({
            ...prev,
            totalDiscovered: count,
            queued: count,
            currentFolderName: folderLabel,
          }));
        },
      });

      if (stopRequestedRef.current) {
        commitState((prev) => markDriveStopped(prev));
        return;
      }

      let itemsToQueue = discovery.items;
      const importedSet = getImportedFileIds(folderId);

      if (incrementalSyncRef.current && !forceRescan && importedSet.size > 0) {
        const beforeCount = itemsToQueue.length;
        itemsToQueue = itemsToQueue.filter((item) => !importedSet.has(item.fileId));
        const skippedCount = beforeCount - itemsToQueue.length;
        if (skippedCount > 0) {
          showToast(`Skipped ${skippedCount} already imported file(s).`, 'info');
        }
      }

      commitState((prev) => seedDriveQueue(prev, itemsToQueue, discovery.packetsCount, 'drive'));
      if (itemsToQueue.length === 0) {
        showToast('All files in this Drive folder are already imported and up to date.', 'success');
        commitState((prev) => completeDriveRun(prev));
        return;
      }

      await runQueueLoop(token);
    } catch (err: any) {
      if (stopRequestedRef.current) {
        commitState((prev) => markDriveStopped(prev));
        return;
      }
      const msg = toUserErrorMessage(err, 'Failed to read Google Drive folder.');
      commitState((prev) => failDriveRun(prev, msg));
      showToast(msg, 'error');
    }
  }, [commitState, ensureDriveToken, runQueueLoop, showToast]);

  const resetDriveCache = useCallback(() => {
    const folderId = extractDriveFolderId(stateRef.current.folderInput);
    if (folderId) {
      clearDriveImportCache(folderId);
      showToast('Import list reset. The next import will check all files.', 'success');
    }
  }, [showToast]);

  const pauseImport = useCallback(() => {
    pauseRequestedRef.current = true;
    commitState((prev) => markDrivePaused(prev));
  }, [commitState]);

  const resumeImport = useCallback(async () => {
    if (stateRef.current.status !== 'paused') return;
    pauseRequestedRef.current = false;
    stopRequestedRef.current = false;
    try {
      const token = await ensureDriveToken();
      commitState((prev) => resumeDriveRun(prev));
      await runQueueLoop(token);
    } catch (err: any) {
      const msg = toUserErrorMessage(err, 'Unable to resume Google Drive import.');
      commitState((prev) => failDriveRun(prev, msg));
      showToast(msg, 'error');
    }
  }, [commitState, ensureDriveToken, runQueueLoop, showToast]);

  const stopImport = useCallback(async () => {
    stopRequestedRef.current = true;
    pauseRequestedRef.current = false;
    abortControllerRef.current?.abort();
    if (stateRef.current.jobId) {
      await stopJob(stateRef.current.jobId).catch(() => false);
    }
    commitState((prev) => markDriveStopped(prev));
  }, [commitState]);

  const connectGoogleDrive = useCallback(async () => {
    try {
      await ensureDriveToken(true);
      showToast('Google Drive access connected.', 'success');
    } catch (err: any) {
      showToast(toUserErrorMessage(err, 'Google sign-in failed.'), 'error');
    }
  }, [ensureDriveToken, showToast]);

  return {
    driveState,
    incrementalSync,
    setIncrementalSync,
    setFolderInput,
    startImport: () => startImport(false),
    forceRescanImport: () => startImport(true),
    resetDriveCache,
    pauseImport,
    resumeImport,
    stopImport,
    connectGoogleDrive,
  };
}

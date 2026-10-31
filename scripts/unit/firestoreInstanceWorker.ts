/**
 * One simulated Lambda instance for the C6 cross-instance test. Role A
 * creates the job, B performs an upload-single (draining its queue exactly
 * like services/serverless/documentsRoutes.ts does), C finalizes; every
 * mutation is awaited through commitDocumentStoreWrites before exit so the
 * "instance" is frozen right after a durable write.
 *
 * Activation contract: the parent sets VERCEL=1 + a fixture service account,
 * so store.ts binds Firestore mode at import and the workers MUST emit one
 * JSON line as their last stdout output (the parent parses it).
 */
const role = process.argv[2];
const jobId = process.argv[3] || '';

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (!role) throw new Error('role argument required (A|B|C)');
  const { commitDocumentStoreWrites } = await import('../../services/documentArchive/firestoreStore.js');
  const S = await import('../../services/documentArchiveService.js');

  if (role === 'A') {
    const job = S.createBatchJob(1);
    await commitDocumentStoreWrites();
    console.log(JSON.stringify({ role, jobId: job.id, status: job.status }));
    return;
  }
  if (role === 'B') {
    if (!jobId) throw new Error('instance B needs the jobId');
    // A REAL 420x420 PNG so the pipeline processes it normally (a junk buffer
    // would crash sharp and end the job honestly-but-'failed'); deterministic
    // color keeps dupes/hashes stable, and worker B must also stay quiet on
    // Gemini keys (none are configured in the child env).
    const sharp = (await import('sharp')).default;
    const buffer = await sharp({
      create: { width: 420, height: 420, channels: 3, background: { r: 180, g: 60, b: 120 } },
    }).png().toBuffer();
    const result = await S.addSingleFileToJob(jobId, `GR3021_fix${role}.png`, buffer, '3021');
    // mimic the upload-single route: drain the request queue in-process
    await S.drainProcessingQueue([]);
    await commitDocumentStoreWrites();
    console.log(JSON.stringify({ role, enqueued: result.enqueued, jobId: result.job.id, processedFiles: S.getJobStatus(jobId)?.processedFiles }));
    return;
  }
  if (role === 'C') {
    if (!jobId) throw new Error('instance C needs the jobId');
    const job = await S.finalizeBatchJob(jobId, [], { awaitCompletion: true });
    await commitDocumentStoreWrites();
    const { id, status, totalFiles, processedFiles, currentStageDescription, duplicateCount, failedCount, successCount } = job;
    console.log(JSON.stringify({ role, job: { id, status, totalFiles, processedFiles, currentStageDescription, duplicateCount, failedCount, successCount } }));
    return;
  }
  throw new Error(`unknown role ${role}`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err && (err as Error).stack || err);
    process.exit(1);
  });

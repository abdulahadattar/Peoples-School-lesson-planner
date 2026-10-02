/**
 * Verifies the storage adapter contract without any cloud credentials.
 *
 * The Firestore/Cloud Storage implementation has to match this behaviour
 * exactly, so these checks are the specification, not a smoke test.
 * Run: npx tsx scripts/test-storage-adapter.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createInMemoryAdapter, createStorageAdapter } from '../services/storage/index.ts';

let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (err) {
    fail(name, err && err.message ? err.message : String(err));
  }
}

const adapter = createInMemoryAdapter();
const { metadata, blob } = adapter;

console.log('\n  Storage adapter contract\n');

// ── 1. metadata round-trip ────────────────────────────────────────────────
await check('metadata set/get round-trips', async () => {
  await metadata.set('dossiers', {
    'GR_1': { grNo: 'GR_1', name: 'Ayesha' },
    'GR_2': { grNo: 'GR_2', name: 'Bilal' },
  });
  const got = await metadata.get('dossiers');
  assert.equal(got['GR_1'].name, 'Ayesha');
  assert.equal(Object.keys(got).length, 2);
  return `${Object.keys(got).length} records`;
});

// ── 2. metadata list returns all keys ─────────────────────────────────────
await check('metadata get returns every key in the collection', async () => {
  const got = await metadata.get('dossiers');
  const keys = Object.keys(got).sort();
  assert.deepEqual(keys, ['GR_1', 'GR_2']);
  return keys.join(', ');
});

// ── 3. metadata delete ────────────────────────────────────────────────────
await check('metadata remove drops the key, leaves the rest intact', async () => {
  await metadata.remove('dossiers', 'GR_1');
  const got = await metadata.get('dossiers');
  assert.equal(got['GR_1'], undefined);
  assert.equal(got['GR_2'].name, 'Bilal');
  await metadata.remove('dossiers', 'does-not-exist');
  return 'GR_1 gone, GR_2 intact';
});

// ── 4. blob byte fidelity, >1MB ───────────────────────────────────────────
await check('blob put/get preserves bytes exactly (1.5MB random)', async () => {
  const bytes = crypto.randomBytes(1536 * 1024);
  await blob.put({ grNo: 'GR_42', filename: 'birth-certificate.pdf' }, bytes);
  const got = await blob.get({ grNo: 'GR_42', filename: 'birth-certificate.pdf' });
  assert.ok(got, 'blob should exist');
  assert.equal(got.length, bytes.length);
  assert.ok(got.equals(bytes), 'byte-for-byte mismatch');
  return `${bytes.length} bytes identical`;
});

// ── 5. blob exists ────────────────────────────────────────────────────────
await check('blob exists is true after put, false after remove', async () => {
  const key = { grNo: 'GR_42', filename: 'birth-certificate.pdf' };
  assert.equal(await blob.exists(key), true);
  await blob.remove(key);
  assert.equal(await blob.exists(key), false);
  assert.equal(await blob.get(key), null);
  return 'true -> false, get -> null';
});

// ── 6. blob list is scoped per grNo ───────────────────────────────────────
await check('blob list is scoped to one grNo', async () => {
  await blob.put({ grNo: 'GR_7', filename: 'photo.jpg' }, Buffer.from('seven'));
  await blob.put({ grNo: 'GR_7', filename: 'marksheet.pdf' }, Buffer.from('seven'));
  await blob.put({ grNo: 'GR_8', filename: 'other.pdf' }, Buffer.from('eight'));

  const seven = (await blob.list('GR_7')).sort();
  const eight = await blob.list('GR_8');

  assert.deepEqual(seven, ['marksheet.pdf', 'photo.jpg']);
  assert.deepEqual(eight, ['other.pdf']);
  assert.equal((await blob.list('GR_999')).length, 0, 'unknown grNo must be empty');
  return `GR_7=[${seven}] GR_8=[${eight}]`;
});

// ── 7. reads must not alias stored state ──────────────────────────────────
await check('metadata reads are copies, not live references', async () => {
  await metadata.set('jobs', { j1: { status: 'pending', files: ['a'] } });
  const first = await metadata.get('jobs');
  first['j1'].status = 'MUTATED';
  first['injected'] = { status: 'nope' };

  const second = await metadata.get('jobs');
  assert.equal(second['j1'].status, 'pending', 'caller mutation leaked into storage');
  assert.equal(second['injected'], undefined, 'caller injection leaked into storage');
  return 'mutation did not persist';
});

// ── 8. blob reads must not alias stored bytes ─────────────────────────────
await check('blob reads are copies, not live references', async () => {
  await blob.put({ grNo: 'GR_9', filename: 'a.pdf' }, Buffer.from('original'));
  const first = await blob.get({ grNo: 'GR_9', filename: 'a.pdf' });
  first.write('HACKED!');
  const second = await blob.get({ grNo: 'GR_9', filename: 'a.pdf' });
  assert.equal(second.toString(), 'original');
  return 'byte mutation did not persist';
});

// ── 9. moveGr replaces the destination and empties the source ─────────────
await check('moveGr relocates every object and clears the source', async () => {
  await blob.put({ grNo: 'GR_OLD', filename: 'x.pdf' }, Buffer.from('x'));
  await blob.put({ grNo: 'GR_OLD', filename: 'y.pdf' }, Buffer.from('y'));
  // A stale file at the destination must not survive the move.
  await blob.put({ grNo: 'GR_NEW', filename: 'stale.pdf' }, Buffer.from('stale'));

  await blob.moveGr('GR_OLD', 'GR_NEW');

  const moved = (await blob.list('GR_NEW')).sort();
  assert.deepEqual(moved, ['x.pdf', 'y.pdf'], 'destination should hold exactly the source objects');
  assert.equal((await blob.list('GR_OLD')).length, 0, 'source should be empty');
  const movedBytes = await blob.get({ grNo: 'GR_NEW', filename: 'x.pdf' });
  assert.equal(movedBytes.toString(), 'x');
  return `[${moved}]`;
});

// ── 10. factory must fail loudly, never degrade silently ──────────────────
await check('factory throws for firestore instead of falling back', async () => {
  const previous = process.env.DOCUMENT_STORAGE_BACKEND;
  process.env.DOCUMENT_STORAGE_BACKEND = 'firestore';
  try {
    createStorageAdapter();
    throw new Error('expected createStorageAdapter() to throw for an unimplemented backend');
  } catch (err) {
    if (!/not implemented yet/i.test(err.message)) throw err;
    return 'throws with an actionable message';
  } finally {
    if (previous === undefined) delete process.env.DOCUMENT_STORAGE_BACKEND;
    else process.env.DOCUMENT_STORAGE_BACKEND = previous;
  }
});

await check('factory defaults to in-memory and names the backend', () => {
  const a = createStorageAdapter();
  assert.equal(a.backend, 'in-memory');
  return a.backend;
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);

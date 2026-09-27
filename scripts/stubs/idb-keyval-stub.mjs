/**
 * In-memory stand-in for `idb-keyval`, used by the paper-history regression test
 * so the storage layer can be exercised under Node (which has no IndexedDB)
 * without pulling in a new dependency.
 */
const mem = new Map();

export async function get(key) {
  return mem.has(key) ? mem.get(key) : undefined;
}

export async function set(key, value) {
  mem.set(key, value);
}

export async function del(key) {
  mem.delete(key);
}

export async function clear() {
  mem.clear();
}

export async function keys() {
  return [...mem.keys()];
}

/** Test helper: inspect and reset the backing store. */
export function __mem() {
  return mem;
}

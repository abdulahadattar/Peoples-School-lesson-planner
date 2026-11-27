import { register } from 'node:module';

/**
 * Redirects `idb-keyval` to an in-memory stub so storageService can run under
 * Node. Keeps the regression test dependency-free.
 */
const stub = new URL('../stubs/idb-keyval-stub.mjs', import.meta.url).href;

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export function resolve(specifier, context, next) {
  if (specifier === 'idb-keyval') {
    return { url: ${JSON.stringify(stub)}, shortCircuit: true, format: 'module' };
  }
  return next(specifier, context);
}
`)
);

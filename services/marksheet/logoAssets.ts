export interface MarksheetLogoAssets {
  phssjPngBytes?: Uint8Array;
  zuebPngBytes?: Uint8Array;
  principalSigPngBytes?: Uint8Array;
}

export interface MarksheetLogoUrls {
  schoolLogoUrl?: string;
  affiliationLogoUrl?: string;
  principalSignatureUrl?: string;
}

const DEFAULT_SCHOOL_LOGO = '/logos/phssj.png';
const DEFAULT_AFFILIATION_LOGO = '/logos/ziauddin-university.png';
const DEFAULT_PRINCIPAL_SIG = '/logos/principal-signature.png';

const cacheByKey = new Map<string, MarksheetLogoAssets>();
const inFlightByKey = new Map<string, Promise<MarksheetLogoAssets>>();
let lastCacheKey: string | null = null;

function resolveUrls(urls?: MarksheetLogoUrls) {
  return {
    school: (urls?.schoolLogoUrl || '').trim() || DEFAULT_SCHOOL_LOGO,
    affiliation: (urls?.affiliationLogoUrl || '').trim() || DEFAULT_AFFILIATION_LOGO,
    signature: (urls?.principalSignatureUrl || '').trim() || DEFAULT_PRINCIPAL_SIG,
  };
}

function makeCacheKey(urls?: MarksheetLogoUrls): string {
  const r = resolveUrls(urls);
  return `${r.school}|${r.affiliation}|${r.signature}`;
}

export function peekMarksheetLogoAssets(urls?: MarksheetLogoUrls): MarksheetLogoAssets | null {
  const key = urls ? makeCacheKey(urls) : lastCacheKey;
  if (!key) return null;
  return cacheByKey.get(key) || null;
}

export function resetMarksheetLogoCacheForTesting(): void {
  cacheByKey.clear();
  inFlightByKey.clear();
  lastCacheKey = null;
}

function decodeBase64DataUrl(dataUrl: string): Uint8Array | undefined {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return undefined;
    const base64 = dataUrl.slice(commaIdx + 1);
    if (typeof atob === 'function') {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchMarksheetLogoAssets(
  urls?: MarksheetLogoUrls
): Promise<MarksheetLogoAssets> {
  const resolved = resolveUrls(urls);
  const key = `${resolved.school}|${resolved.affiliation}|${resolved.signature}`;

  const existing = cacheByKey.get(key);
  if (existing) {
    lastCacheKey = key;
    return existing;
  }
  const pending = inFlightByKey.get(key);
  if (pending) {
    return pending;
  }

  const loadImageBytes = async (url: string): Promise<Uint8Array | undefined> => {
    if (url.startsWith('data:')) {
      return decodeBase64DataUrl(url);
    }
    if (typeof fetch === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return undefined;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return undefined;
    }
  };

  const promise = Promise.all([
    loadImageBytes(resolved.school),
    loadImageBytes(resolved.affiliation),
    loadImageBytes(resolved.signature),
  ])
    .then(([phssjPngBytes, zuebPngBytes, principalSigPngBytes]) => {
      const assets: MarksheetLogoAssets = {};
      if (phssjPngBytes) assets.phssjPngBytes = phssjPngBytes;
      if (zuebPngBytes) assets.zuebPngBytes = zuebPngBytes;
      if (principalSigPngBytes) assets.principalSigPngBytes = principalSigPngBytes;
      if (phssjPngBytes || zuebPngBytes || principalSigPngBytes) {
        cacheByKey.set(key, assets);
        lastCacheKey = key;
      }
      return assets;
    })
    .finally(() => {
      inFlightByKey.delete(key);
    });

  inFlightByKey.set(key, promise);
  return promise;
}

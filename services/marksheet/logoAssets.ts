export interface MarksheetLogoAssets {
  phssjPngBytes?: Uint8Array;
  zuebPngBytes?: Uint8Array;
  principalSigPngBytes?: Uint8Array;
}

let cachedLogoAssets: MarksheetLogoAssets | null = null;
let inFlightLogoAssets: Promise<MarksheetLogoAssets> | null = null;

export function peekMarksheetLogoAssets(): MarksheetLogoAssets | null {
  return cachedLogoAssets;
}

export function resetMarksheetLogoCacheForTesting(): void {
  cachedLogoAssets = null;
  inFlightLogoAssets = null;
}

export async function fetchMarksheetLogoAssets(): Promise<MarksheetLogoAssets> {
  if (cachedLogoAssets) {
    return cachedLogoAssets;
  }
  if (inFlightLogoAssets) {
    return inFlightLogoAssets;
  }
  if (typeof fetch === 'undefined' || typeof window === 'undefined') {
    return {};
  }

  const loadPng = async (url: string): Promise<Uint8Array | undefined> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return undefined;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return undefined;
    }
  };

  inFlightLogoAssets = Promise.all([
    loadPng('/logos/phssj.png'),
    loadPng('/logos/ziauddin-university.png'),
    loadPng('/logos/principal-signature.png'),
  ])
    .then(([phssjPngBytes, zuebPngBytes, principalSigPngBytes]) => {
      const assets: MarksheetLogoAssets = {
        phssjPngBytes,
        zuebPngBytes,
        principalSigPngBytes,
      };
      if (phssjPngBytes || zuebPngBytes || principalSigPngBytes) {
        cachedLogoAssets = assets;
      }
      return assets;
    })
    .finally(() => {
      inFlightLogoAssets = null;
    });

  return inFlightLogoAssets;
}

import { Part } from "@google/genai";
import { blobToBase64 } from '../documentClientService';

export function toProxyUrl(url: string): string | null {
  if (!url || url.startsWith('/pdf-proxy')) return null;
  const rawMatch = url.match(/^https?:\/\/raw\.githubusercontent\.com\/(.+)/i);
  if (rawMatch) return `/pdf-proxy/${rawMatch[1].replace(/^\/+/, '')}`;
  const ghBlobOrRaw = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i);
  if (ghBlobOrRaw) return `/pdf-proxy/${ghBlobOrRaw[1]}/${ghBlobOrRaw[2]}/${ghBlobOrRaw[3]}`;
  return null;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isPdfBlob(blob: Blob, contentType: string): Promise<boolean> {
  return blob.slice(0, 5).text().then(header =>
    header.startsWith('%PDF') || contentType.includes('pdf')
  );
}

export async function downloadPdfAsPart(url: string): Promise<Part | null> {
  const candidates = [toProxyUrl(url), url].filter((u): u is string => Boolean(u));

  for (const candidate of candidates) {
    const response = await fetchWithTimeout(candidate, 60000);
    if (!response || !response.ok) continue;

    try {
      const blob = await response.blob();
      if (!(await isPdfBlob(blob, response.headers.get('content-type') || ''))) continue;

      const base64 = await blobToBase64(blob);
      console.log(`[geminiService] PDF downloaded successfully: ${(base64.length * 0.75 / 1024).toFixed(0)}KB from ${url}`);
      return { inlineData: { mimeType: 'application/pdf', data: base64 } };
    } catch (err) {
      console.error(`[geminiService] PDF encoding error for ${url}:`, err);
      return null;
    }
  }

  console.warn(`[geminiService] PDF download failed for ${url}`);
  return null;
}

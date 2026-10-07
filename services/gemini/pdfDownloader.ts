import { Part } from "@google/genai";
import { blobToBase64 } from '../documentClientService';

function toProxyUrl(url: string): string | null {
  if (!url.includes('github.com') || url.startsWith('/pdf-proxy')) return null;
  const ghMatch = url.match(/raw\.githubusercontent\.com\/(.+)/);
  return ghMatch ? `/pdf-proxy/${ghMatch[1]}` : `/pdf-proxy/${url}`;
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

import { Part } from '@google/genai';

export interface PdfContext {
  name: string;
  grade: string;
  unit: string;
  url: string;
}

interface DownloadResult {
  base64: string;
  fileName: string;
}

/**
 * Downloads a PDF from a URL and converts it to a base64-encoded Part for Gemini API.
 * Uses Vite dev server proxy for GitHub raw URLs to bypass CORS.
 * Includes automatic retry (2 attempts) and caching awareness.
 */
export async function downloadPdfAsBase64(url: string, fileName: string): Promise<Part> {
  let fetchUrl = url;
  
  if (!url.startsWith('/pdf-proxy')) {
    const ghMatch = url.match(/^https?:\/\/raw\.githubusercontent\.com\/(.+)$/);
    if (ghMatch) {
      fetchUrl = `/pdf-proxy/${ghMatch[1]}`;
    }
  }
  
  const response = await fetchWithRetry(fetchUrl, 2);
  const base64 = await response
    .clone()
    .blob()
    .then(blob => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      return new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
      });
    });
  
  return {
    inlineData: {
      mimeType: 'application/pdf',
      data: base64,
    },
  };
}

/**
 * Fetches content with automatic retry on failure.
 */
async function fetchWithRetry(url: string, maxRetries: number): Promise<Response> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/pdf',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('pdf')) {
        throw new Error(`Expected PDF but got ${contentType || 'unknown content-type'}`);
      }
      
      const contentLength = +(response.headers.get('content-length') || '0');
      if (contentLength > 0 && contentLength < 10000) {
        throw new Error(`File too small (${contentLength} bytes), likely invalid`);
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        console.warn(`[pdfContextService] Download failed, retry ${attempt + 1}/${maxRetries + 1}:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  throw new Error(`Failed to download PDF after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Loads PDF URL from the SLO JSON files for a specific chapter.
 */
export async function loadChapterPdfUrl(
  grade: string,
  subject: string,
  chapterNumber: number
): Promise<string | null> {
  try {
    const path = `/curriculum/slos/${grade}/${subject.toLowerCase()}.json`;
    const response = await fetch(path);
    if (!response.ok) return null;
    
    const data = await response.json();
    const chapter = data.chapters?.find((c: any) => c.chapter_number === chapterNumber);
    return chapter?.pdf_url || null;
  } catch (error) {
    console.error('[pdfContextService] Error loading PDF URL:', error);
    return null;
  }
}

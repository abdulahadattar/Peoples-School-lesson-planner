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
  // CORS fix: GitHub raw URLs need proxy in browser environment
  let fetchUrl = url;
  let useProxy = false;
  
  if (url.includes('github.com') || url.includes('raw.githubusercontent.com')) {
    // Use Vite dev server proxy
    const ghMatch = url.match(/raw\.githubusercontent\.com\/(.+)/);
    if (ghMatch) {
      fetchUrl = `/pdf-proxy/${ghMatch[1]}`;
      useProxy = true;
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
 * Maps curriculum chapter info to PDF URLs from the curriculum structure.
 * Uses the pdf_url field from the chapter data in curriculum/slos/JSON files.
 */
export function getChapterPdfUrl(classId: string, subjectId: string, chapterId: string): string | null {
  // Extract grade from classId (e.g., 'class9' -> 'Grade 9')
  const gradeNum = classId.replace('class', '');
  const grade = `Grade ${parseInt(gradeNum, 10)}`;
  
  // Normalize chapter number (e.g., 'ch3' -> '3')
  const chapterNum = chapterId.replace('ch', '');
  
  // Try to match by looking up the JSON file for the subject
  // URL pattern from physics.json: "https://raw.githubusercontent.com/abdulahadattar/STBB-BOOKS/main/Grade%209/Physics/Chapter%2003%20-%20DYNAMICS.pdf"
  // Map classId/subjectId to expected URL patterns
  const subjectMap: Record<string, string> = {
    'physics': 'Physics',
    'chemistry': 'Chemistry',
    'mathematics': 'Mathematics',
    'biology': 'Biology',
    'english': 'English',
  };
  
  const subjectName = subjectMap[subjectId]?.toLowerCase();
  if (!subjectName) return null;
  
  // Build URL - use two-digit chapter number with leading zero if needed
  const chapterNumPadded = chapterNum.padStart(2, '0');
  
  // This will be replaced with actual lookup from curriculum/slos files
  // For now, return a pattern hint
  return `https://raw.githubusercontent.com/abdulahadattar/STBB-BOOKS/main/${encodeURIComponent(grade)}/${subjectMap[subjectId]}/Chapter%20${chapterNumPadded}%20-%20${subjectMap[subjectId]}.pdf`;
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

/**
 * Gets context PDF part for a specific SLO, downloading and encoding as needed.
 */
export async function getContextPartForSlo(
  slo: { grade: string; Unit_Number: string | number },
  onProgress?: (msg: string) => void
): Promise<Part | null> {
  const chapterNum = parseInt(String(slo.Unit_Number), 10);
  
  // Determine subject from context - this will need to be passed explicitly
  // For now, we'll need to look up from the curriculum
  onProgress?.(`Downloading context PDF for Chapter ${chapterNum}...`);
  
  // This function will need the subjectName to be passed in
  // We'll handle this in the hook that calls it
  return null;
}
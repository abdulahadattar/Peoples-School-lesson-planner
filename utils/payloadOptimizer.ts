/**
 * Payload Optimizer Utility
 * Ensures network egress and storage payloads remain ultra-compact
 */

/**
 * Compresses an image File or Blob to a compact WebP/JPEG data URL or Blob.
 * Caps maximum dimension (default 320px) and quality (0.75) to keep image payloads under ~20-30KB.
 */
export async function compressImage(
  file: File | Blob,
  maxDimension: number = 320,
  quality: number = 0.75
): Promise<{ dataUrl: string; sizeBytes: number; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Scale down proportionally
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context not available'));
          return;
        }

        // Draw image with smooth scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try webp first, fallback to jpeg
        let mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL(mimeType, quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/jpeg';
          dataUrl = canvas.toDataURL(mimeType, quality);
        }

        const base64Data = dataUrl.split(',')[1] || '';
        const sizeBytes = Math.round((base64Data.length * 3) / 4);

        resolve({ dataUrl, sizeBytes, mimeType });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Calculates rough payload size in bytes for an object when JSON-stringified.
 */
export function estimatePayloadSize(obj: unknown): number {
  try {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  } catch {
    return 0;
  }
}

/**
 * Formats byte size into human readable KB / MB string.
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

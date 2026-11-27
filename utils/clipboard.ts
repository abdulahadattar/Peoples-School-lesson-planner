/**
 * Standard clipboard copy utility with safe fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || text === '—' || text.toUpperCase() === 'NA' || text.toUpperCase() === 'N/A') {
    return false;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for environments where clipboard API is restricted
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

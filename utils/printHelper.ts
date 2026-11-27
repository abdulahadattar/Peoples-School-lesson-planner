/**
 * Unified printing helper that works cleanly in standard tabs as well as iframe sandboxes
 * without triggering popup blockers or window.open.
 */
export function printHtml(html: string): void {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.parentNode?.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();

    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.parentNode?.removeChild(iframe);
        }, 1000);
      }
    }, 350);
  } catch (err) {
    console.error('Failed to print document:', err);
  }
}

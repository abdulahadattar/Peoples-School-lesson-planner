/**
 * Equation Renderer — renders LaTeX equations to images using KaTeX.
 * Used by the DOCX and PDF export services to produce proper math formatting.
 *
 * KaTeX is loaded via CDN in index.html, so window.katex is available in the browser.
 */

declare global {
  interface Window {
    katex?: {
      renderToString: (latex: string, options?: any) => string;
    };
  }
}

// Match $$...$$ (display) and $...$ (inline) LaTeX delimiters
const LATEX_REGEX = /(\$\$[\s\S]*?\$\$|\$(?!\s)(?:[^$\\]|\\.)+?\$)/g;

// Common equation patterns that the AI produces without LaTeX delimiters
// e.g. "(3/2)kT", "P = (1/3) ρ v²", "PV = nRT", "F = ma", "E = mc^2"
// These get wrapped in $...$ for KaTeX rendering
const PLAIN_EQUATION_PATTERNS = [
  // Explicit equation patterns with = sign and math symbols
  /(?<![\w])([A-Z]\s*=\s*[\d/().\w^²³⁴√∑∫αβγδεζηθκλμνξπρστφχψωℝℂℏ∇±∞∑∫∏∂√∛∜]+(?:\s*[+\-×÷*/]\s*[\d/().\w^²³⁴]+)*)\s*(?=[,;.)\]\n]|$)/g,
  // Fraction patterns like (3/2), (1/3), (2/3)
  /(?<![\w])(\(\d+\/\d+\)[\w²³⁴]*)\b/g,
];

/**
 * Check if KaTeX is available in the browser.
 */
export function isKatexAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.katex?.renderToString === 'function';
}

/**
 * Render a single LaTeX equation to an SVG string using KaTeX.
 */
function renderLatexToSvg(latex: string, displayMode: boolean): string | null {
  if (!window.katex) return null;
  try {
    return window.katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: 'html',  // Use HTML+CSS output (more compatible than SVG)
    });
  } catch {
    return null;
  }
}

/**
 * Convert an HTML element containing rendered KaTeX to a PNG data URL.
 * Creates a temporary off-screen container, renders KaTeX, captures with canvas.
 */
async function htmlToDataUrl(html: string, fontSize: number = 16): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: -9999px;
    font-size: ${fontSize}px;
    line-height: 1;
    white-space: nowrap;
    font-family: 'KaTeX_Main', 'Times New Roman', serif;
  `;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // Wait a tick for KaTeX CSS to apply
    await new Promise(r => setTimeout(r, 50));

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const canvas = document.createElement('canvas');
    const scale = 2; // 2x for sharp rendering
    canvas.width = Math.ceil(rect.width * scale);
    canvas.height = Math.ceil(rect.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Use foreignObject to render HTML in canvas
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(canvas.width));
    svg.setAttribute('height', String(canvas.height));
    svg.innerHTML = `<foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="
        transform: scale(${scale});
        transform-origin: top left;
        font-size: ${fontSize}px;
        line-height: 1;
        white-space: nowrap;
        font-family: 'KaTeX_Main', 'Times New Roman', serif;
        display: inline-block;
      ">${html}</div>
    </foreignObject>`;
    const data = new XMLSerializer().serializeToString(svg);

    const img = new Image();
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    return new Promise<string | null>((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } finally {
    document.body.removeChild(container);
  }
}

export interface ParsedContent {
  type: 'text' | 'equation';
  value: string;      // plain text or LaTeX source
  image?: string;      // base64 data URL of rendered equation (for equations)
  display?: boolean;   // true for $$..$$ display mode
}

/**
 * Parse text containing LaTeX equations into segments.
 * Each segment is either plain text or a rendered equation image.
 */
export async function parseTextWithEquations(
  text: string,
  fontSize: number = 16
): Promise<ParsedContent[]> {
  const segments: ParsedContent[] = [];

  if (!text) return segments;

  // If KaTeX is not available, return plain text
  if (!isKatexAvailable()) {
    let cleaned = text.replace(/\$\$/g, '').replace(/\$/g, '');
    return [{ type: 'text', value: cleaned }];
  }

  // Step 1: Find all LaTeX-delimited equations
  let lastIndex = 0;
  let match;
  LATEX_REGEX.lastIndex = 0;

  while ((match = LATEX_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.substring(lastIndex, match.index);
      segments.push(...await processPlainText(before, fontSize));
    }

    const matchedText = match[0];
    const isDisplay = matchedText.startsWith('$$');
    const latex = isDisplay
      ? matchedText.slice(2, -2).trim()
      : matchedText.slice(1, -1).trim();

    const html = renderLatexToSvg(latex, isDisplay);
    if (html) {
      const image = await htmlToDataUrl(html, fontSize);
      segments.push({
        type: 'equation',
        value: latex,
        image: image || undefined,
        display: isDisplay,
      });
    } else {
      segments.push({ type: 'text', value: latex });
    }

    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < text.length) {
    segments.push(...await processPlainText(text.substring(lastIndex), fontSize));
  }

  return segments;
}

/**
 * Process plain text (no LaTeX delimiters) and try to detect equations.
 * Tries common patterns like fractions, equations with =, superscripts, etc.
 */
async function processPlainText(text: string, fontSize: number): Promise<ParsedContent[]> {
  const segments: ParsedContent[] = [];

  // Quick check: if the text has no math-like content, return as-is
  if (!/[=^²³⁴⁵⁶⁷⁸⁹⁰√∑∫αβγδθπστφωℏ∇±∞]|\d+\/\d+|\b[A-Z]\s*=/.test(text)) {
    return [{ type: 'text', value: text }];
  }

  // Try to render the entire text as a KaTeX equation (it handles plain text too)
  // If it contains an equation-like pattern, try rendering it
  const html = renderLatexToSvg(text.trim(), false);
  if (html) {
    const image = await htmlToDataUrl(html, fontSize);
    if (image) {
      return [{ type: 'equation', value: text.trim(), image, display: false }];
    }
  }

  // Fallback: return as plain text
  return [{ type: 'text', value: text }];
}

/**
 * Convert a data URL to a Buffer (for Node.js) or keep as string (for browser).
 * Returns the raw base64 string (without the data:image/png;base64, prefix).
 */
export function dataUrlToBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return dataUrl;
  return dataUrl.substring(commaIndex + 1);
}

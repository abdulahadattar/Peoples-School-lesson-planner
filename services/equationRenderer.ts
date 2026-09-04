/**
 * Equation Renderer — renders LaTeX equations to PNG data URLs for the DOCX
 * and PDF export services.
 *
 * The DOCX/PDF exporters embed equations as raster images, so math must be
 * converted to a canvas-safe format. KaTeX + <foreignObject> canvases are
 * tainted in Chromium (exports used to hang or drop equations), so we render
 * with MathJax (tex-svg) which produces a pure, self-contained SVG that
 * <canvas> can rasterize safely. MathJax is lazy-loaded from the CDN on the
 * first export.
 *
 * Every failure path (MathJax missing, rasterization error, oversized output)
 * degrades gracefully to plain text — an export must never hang or throw on
 * a math expression.
 */

declare global {
  interface Window {
    MathJax?: {
      tex2svg: (latex: string, options?: any) => HTMLElement;
    };
    katex?: {
      renderToString: (latex: string, options?: any) => string;
    };
  }
}

import { isFormulaText } from './latexSanitizer';

// Match $$...$$ (display) and $...$ (inline) LaTeX delimiters
const LATEX_REGEX = /(\$\$[\s\S]*?\$\$|\$(?!\s)(?:[^$\\]|\\.)+?\$)/g;

// Guardrails so one equation can never stall an export or blow up memory.
const MAX_EQUATION_CHARS = 400;
const MAX_AUTO_RENDER_CHARS = 160;
const MAX_RENDER_WIDTH = 1500;
const MAX_RENDER_HEIGHT = 500;
const RENDER_WATCHDOG_MS = 3000;

// Prose words that signal "this is a sentence, not a formula" when '=' appears
const PROSE_WORDS = /\b(the|and|that|with|from|word|words|is|are|was|were|this|which|where|these|those|between|using|water|oxygen|hydrogen|cell|cells|every|into|about|such|has|have|can|could|will|would|their|there)\b/i;

let mathJaxPromise: Promise<boolean> | null = null;

/**
 * Lazily load MathJax (tex-svg) from the CDN, exactly once.
 * Resolves false when MathJax cannot be made available (no browser, offline).
 */
function loadMathJax(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (window.MathJax?.tex2svg) return Promise.resolve(true);
  if (!mathJaxPromise) {
    mathJaxPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
      script.async = true;
      script.onload = () => resolve(!!window.MathJax?.tex2svg);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      // Never wait longer than ~8s for the CDN
      setTimeout(() => resolve(!!window.MathJax?.tex2svg), 8000);
    });
  }
  return mathJaxPromise;
}

/**
 * Render a LaTeX string to a self-contained SVG via MathJax and measure it.
 * Returns { svg, width, height } in CSS pixels, or null on any failure.
 */
async function renderLatexToSvg(
  latex: string,
  display: boolean,
  fontSize: number
): Promise<{ svg: string; width: number; height: number } | null> {
  if (!latex || latex.length > MAX_EQUATION_CHARS) return null;
  if (!(await loadMathJax()) || !window.MathJax?.tex2svg) return null;

  let container: HTMLElement;
  try {
    container = window.MathJax.tex2svg(latex, { display, em: Math.round(fontSize) });
  } catch {
    return null;
  }

  const svgEl = container.querySelector('svg');
  if (!svgEl) return null;

  // Measure with MathJax's CSS applied (ex units -> px), then force px dims
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;';
  const clone = svgEl.cloneNode(true) as SVGElement;
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    const rect = clone.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (rect.width > MAX_RENDER_WIDTH || rect.height > MAX_RENDER_HEIGHT) return null;
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    // Force px dimensions (attribute + style) so the SVG rasterizes at a
    // known intrinsic size when loaded through an <img>.
    clone.setAttribute('width', `${width}`);
    clone.setAttribute('height', `${height}`);
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    const svg = new XMLSerializer().serializeToString(clone);
    return { svg, width, height };
  } catch {
    return null;
  } finally {
    document.body.removeChild(holder);
  }
}

/**
 * Rasterize a self-contained SVG string to a PNG data URL via <img> + canvas.
 * Pure SVGs (no foreignObject / external resources) do not taint the canvas,
 * so toDataURL is safe here. Never rejects: returns null on failure.
 */
async function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const scale = 2; // 2x for sharp output in print
  let url: string | null = null;
  try {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    url = URL.createObjectURL(blob);
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        if (url) {
          URL.revokeObjectURL(url);
          url = null;
        }
        resolve(value);
      };
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(Math.ceil(width * scale), 4096);
          canvas.height = Math.min(Math.ceil(height * scale), 2048);
          const ctx = canvas.getContext('2d');
          if (!ctx) return finish(null);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/png'));
        } catch {
          finish(null);
        }
      };
      img.onerror = () => finish(null);
      img.src = url;
      setTimeout(() => finish(null), RENDER_WATCHDOG_MS);
    });
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export interface ParsedContent {
  type: 'text' | 'equation';
  value: string;      // plain text or LaTeX source
  image?: string;      // PNG data URL of rendered equation (for equations)
  display?: boolean;   // true for $$..$$ display mode
  width?: number;      // natural on-page width in CSS px (equations only)
  height?: number;     // natural on-page height in CSS px (equations only)
}

/**
 * Parse text containing LaTeX equations into segments.
 * Each segment is either plain text or a rendered equation PNG.
 */
export async function parseTextWithEquations(
  text: string,
  fontSize: number = 16
): Promise<ParsedContent[]> {
  const segments: ParsedContent[] = [];

  if (!text) return segments;

  // Node / no browser: math images are impossible — strip delimiters and return
  if (typeof document === 'undefined') {
    return [{ type: 'text', value: text.replace(/\$\$/g, '').replace(/\$/g, '') }];
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

    // Prose wrongly wrapped in math delimiters (e.g. "$Bios$") must stay text —
    // rendering words as equations produces huge stylized glyphs.
    if (!isFormulaText(latex) && /[A-Za-z]/.test(latex)) {
      segments.push({ type: 'text', value: latex });
      lastIndex = match.index + matchedText.length;
      continue;
    }

    const rendered = await renderLatexToSvg(latex, isDisplay, fontSize);
    if (rendered) {
      const image = await svgToPngDataUrl(rendered.svg, rendered.width, rendered.height);
      segments.push({
        type: 'equation',
        value: latex,
        image: image || undefined,
        display: isDisplay,
        width: rendered.width,
        height: rendered.height,
      });
    } else {
      // MathJax unavailable or rendering failed — keep the content as text
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
 * Heuristic: is this trimmed string a standalone formula worth sending to
 * MathJax? Prose that merely contains an '=' or a fraction must NOT be
 * rendered as math — doing so is slow and produces garbage.
 */
function looksLikeEquation(candidate: string): boolean {
  if (!candidate) return false;
  if (candidate.length > MAX_AUTO_RENDER_CHARS) return false;
  // Prose sentences (even short ones with stray math symbols) are never math
  if (PROSE_WORDS.test(candidate)) return false;

  // Explicit fraction like "(3/2)", "3/4", "(1/3)kT"
  if (/\(\d+\s*\/\s*\d+\)[\w²³⁴⁵⁶⁷⁸⁹⁰]*|\d+\s*\/\s*\d+/.test(candidate)) return true;

  // Superscripts / subscripts / greek / operators usually mean real math
  if (/[²³⁴⁵⁶⁷⁸⁹⁰√∑∫∏αβγδθπστφωℏ∇±∞→≤≥]/.test(candidate)) return true;

  // Short formula with '=' that does not read like an English sentence
  if (candidate.includes('=')) {
    const tokens = candidate.trim().split(/\s+/).length;
    if (tokens <= 8) return true;
  }

  return false;
}

/**
 * Process plain text (no LaTeX delimiters) and try to detect equations.
 * Only short, formula-like fragments are attempted; everything else stays text.
 */
async function processPlainText(text: string, fontSize: number): Promise<ParsedContent[]> {
  // Quick check: if the text has no math-like content, return as-is
  if (!/[=^²³⁴⁵⁶⁷⁸⁹⁰√∑∫αβγδθπστφωℏ∇±∞]|\d+\s*\/\s*\d+/.test(text)) {
    return [{ type: 'text', value: text }];
  }

  const candidate = text.trim();
  if (!looksLikeEquation(candidate)) {
    return [{ type: 'text', value: text }];
  }

  const rendered = await renderLatexToSvg(candidate, false, fontSize);
  if (rendered) {
    const image = await svgToPngDataUrl(rendered.svg, rendered.width, rendered.height);
    if (image) {
      return [{ type: 'equation', value: candidate, image, display: false, width: rendered.width, height: rendered.height }];
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

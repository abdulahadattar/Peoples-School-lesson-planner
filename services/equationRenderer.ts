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

import { isFormulaText, MATH_REGEX } from './mathDetection';
import { ensureMathJaxLoaded } from './export/externalLibs';

// Guardrails so one equation can never stall an export or blow up memory.
const MAX_EQUATION_CHARS = 400;
const MAX_AUTO_RENDER_CHARS = 160;
const MAX_RENDER_WIDTH = 1500;
const MAX_RENDER_HEIGHT = 500;
const RENDER_WATCHDOG_MS = 3000;

// Prose words that signal "this is a sentence, not a formula" when '=' appears
const PROSE_WORDS = /\b(the|and|that|with|from|word|words|is|are|was|were|this|which|where|these|those|between|using|water|oxygen|hydrogen|cell|cells|every|into|about|such|has|have|can|could|will|would|their|there)\b/i;

export interface EquationRenderFailure {
  latex: string;
  reason: string;
}

const equationRenderFailures: EquationRenderFailure[] = [];

export function clearEquationRenderFailures(): void {
  equationRenderFailures.length = 0;
}

export function getEquationRenderFailures(): EquationRenderFailure[] {
  return [...equationRenderFailures];
}

function recordEquationFailure(latex: string, reason: string): void {
  if (equationRenderFailures.length < 40) {
    equationRenderFailures.push({ latex, reason });
  }
}

export interface PngPixelHealth {
  darkRatio: number;
  whiteRatio: number;
  isSolidDark: boolean;
  isBlank: boolean;
}

/**
 * Pure RGBA buffer health check so corrupted solid-black rectangles (such as
 * unstyled MathJax merror <rect data-background="true">) or blank images are
 * rejected deterministically before entering Word or PDF documents.
 */
export function inspectPngPixelStats(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): PngPixelHealth {
  const totalPixels = Math.max(1, Math.floor(rgba.length / 4));
  let dark = 0;
  let white = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a < 20 || (r > 242 && g > 242 && b > 242)) {
      white += 1;
    } else if (r < 55 && g < 55 && b < 55) {
      dark += 1;
    }
  }
  const darkRatio = dark / totalPixels;
  const whiteRatio = white / totalPixels;
  const area = width * height;
  const isSolidDark = area >= 64 && darkRatio >= 0.42;
  const isBlank = darkRatio < 0.001 && whiteRatio > 0.995;
  return { darkRatio, whiteRatio, isSolidDark, isBlank };
}

/**
 * Inspect an already-encoded PNG data URL or base64 string in the browser
 * to verify it did not degrade into a solid dark rectangle or empty canvas.
 */
export async function inspectPngDataUrlHealth(
  pngDataUrlOrBase64: string
): Promise<{ width: number; height: number; health: PngPixelHealth } | null> {
  if (typeof document === 'undefined' || !pngDataUrlOrBase64) return null;
  const src = pngDataUrlOrBase64.startsWith('data:')
    ? pngDataUrlOrBase64
    : `data:image/png;base64,${pngDataUrlOrBase64}`;
  return new Promise((resolve) => {
    let settled = false;
    const done = (val: { width: number; height: number; health: PngPixelHealth } | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.max(1, img.naturalWidth || img.width || 1);
        const h = Math.max(1, img.naturalHeight || img.height || 1);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        done({ width: w, height: h, health: inspectPngPixelStats(data, w, h) });
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = src;
    setTimeout(() => done(null), RENDER_WATCHDOG_MS);
  });
}

function loadMathJax(): Promise<boolean> {
  return ensureMathJaxLoaded();
}

/** Check whether the web-page KaTeX renderer is loaded (used by the web UI). */
export function isKatexAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.katex?.renderToString === 'function';
}

/** Check whether export math rendering can work (browser + MathJax). */
export function isMathRendererAvailable(): boolean {
  return typeof document !== 'undefined' && !!window.MathJax?.tex2svg;
}

/**
 * Render a LaTeX string to a self-contained SVG via MathJax and measure it.
 * Returns { svg, width, height } in CSS pixels, or null on any failure or TeX error.
 */
async function renderLatexToSvg(
  latex: string,
  display: boolean,
  fontSize: number
): Promise<{ svg: string; width: number; height: number } | null> {
  if (!latex || latex.length > MAX_EQUATION_CHARS) {
    if (latex) recordEquationFailure(latex, 'Formula exceeded safe rendering length.');
    return null;
  }
  if (!(await loadMathJax()) || !window.MathJax?.tex2svg) return null;

  let container: HTMLElement;
  try {
    container = window.MathJax.tex2svg(latex, { display, em: Math.round(fontSize) });
  } catch (err) {
    recordEquationFailure(latex, `Formula syntax error (${err instanceof Error ? err.message : 'render failed'}).`);
    return null;
  }

  const merrorEl = container.querySelector('[data-mml-node="merror"], [data-mjx-error], mjx-merror');
  if (merrorEl) {
    const errText = merrorEl.getAttribute('data-mjx-error') || 'Malformed LaTeX expression';
    recordEquationFailure(latex, `Malformed formula syntax: ${errText}`);
    return null;
  }

  const svgEl = container.querySelector('svg');
  if (!svgEl) {
    recordEquationFailure(latex, 'Formula did not produce vector geometry.');
    return null;
  }

  // Measure with MathJax's CSS applied (ex units -> px), then force px dims
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;';
  const clone = svgEl.cloneNode(true) as SVGElement;

  // Defense-in-depth: never let an unstyled background <rect> inherit fill="currentColor" (#000)
  clone.querySelectorAll('rect[data-background="true"]').forEach((rect) => {
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', 'none');
  });

  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    const rect = clone.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      recordEquationFailure(latex, 'Formula rendered with zero dimensions.');
      return null;
    }
    if (rect.width > MAX_RENDER_WIDTH || rect.height > MAX_RENDER_HEIGHT) {
      recordEquationFailure(latex, 'Formula exceeded maximum page bounds.');
      return null;
    }
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    clone.setAttribute('width', `${width}`);
    clone.setAttribute('height', `${height}`);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('color', '#000000');
    clone.style.color = '#000000';
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    if (!clone.getAttribute('viewBox') && width > 0 && height > 0) {
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    const svg = new XMLSerializer().serializeToString(clone);
    return { svg, width, height };
  } catch {
    recordEquationFailure(latex, 'Failed to serialize formula SVG.');
    return null;
  } finally {
    document.body.removeChild(holder);
  }
}

/**
 * Rasterize a self-contained SVG string to a PNG data URL via <img> + canvas.
 * Pure SVGs (no foreignObject / external resources) do not taint the canvas,
 * so toDataURL is safe here. Rejects solid-black or blank images cleanly.
 */
async function svgToPngDataUrl(
  svg: string,
  width: number,
  height: number,
  latexForDiagnostics: string = ''
): Promise<string | null> {
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

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const health = inspectPngPixelStats(imgData, canvas.width, canvas.height);
          if (health.isSolidDark || health.isBlank) {
            if (latexForDiagnostics) {
              recordEquationFailure(
                latexForDiagnostics,
                health.isSolidDark
                  ? 'Formula rendered as a solid black block.'
                  : 'Formula rendered as a blank image.'
              );
            }
            return finish(null);
          }

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
  MATH_REGEX.lastIndex = 0;

  while ((match = MATH_REGEX.exec(text)) !== null) {
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
      const image = await svgToPngDataUrl(rendered.svg, rendered.width, rendered.height, latex);
      if (image) {
        segments.push({
          type: 'equation',
          value: latex,
          image,
          display: isDisplay,
          width: rendered.width,
          height: rendered.height,
        });
      } else {
        segments.push({ type: 'text', value: latex });
      }
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

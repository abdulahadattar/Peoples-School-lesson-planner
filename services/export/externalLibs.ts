/**
 * externalLibs.ts — On-demand CDN loaders for heavy math & PDF rendering scripts
 * (KaTeX, MathJax, pdfMake) so they never block or bloat initial landing load.
 */

const KATEX_VERSION = '0.16.10';
const PDFMAKE_VERSION = '0.2.10';

const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
const MATHJAX_JS_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
const PDFMAKE_JS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdfmake/${PDFMAKE_VERSION}/pdfmake.min.js`;
const PDFMAKE_VFS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdfmake/${PDFMAKE_VERSION}/vfs_fonts.js`;

const LESSON_PLAN_TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 1.5 : 1),
  vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1.5 : 1),
  hLineColor: () => '#000000',
  vLineColor: () => '#000000',
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

let katexPromise: Promise<boolean> | null = null;
let mathJaxPromise: Promise<boolean> | null = null;
let pdfMakePromise: Promise<boolean> | null = null;

function loadStylesheet(href: string, id: string): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[data-lazy-lib="${id}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.crossOrigin = 'anonymous';
  link.dataset.lazyLib = id;
  document.head.appendChild(link);
}

function loadScript(src: string, id: string, timeoutMs = 8000): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  const existing = document.querySelector(`script[data-lazy-lib="${id}"]`) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      setTimeout(() => resolve(existing.dataset.loaded === 'true'), timeoutMs);
    });
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.lazyLib = id;
    script.onload = () => {
      script.dataset.loaded = 'true';
      done(true);
    };
    script.onerror = () => done(false);
    document.head.appendChild(script);
    setTimeout(() => done(false), timeoutMs);
  });
}

export function registerPdfMakeLayouts(): void {
  const pm = (typeof window !== 'undefined' ? (window as any).pdfMake : undefined)
    ?? (typeof globalThis !== 'undefined' ? (globalThis as any).pdfMake : undefined);
  if (!pm) return;
  if (!pm.tableLayouts) pm.tableLayouts = {};
  if (!pm.tableLayouts.lessonPlanHeader) {
    pm.tableLayouts.lessonPlanHeader = LESSON_PLAN_TABLE_LAYOUT;
  }
}

export async function ensureKatexLoaded(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if ((window as any).katex?.renderToString) return true;
  if (!katexPromise) {
    katexPromise = (async () => {
      loadStylesheet(KATEX_CSS_URL, 'katex-css');
      const ok = await loadScript(KATEX_JS_URL, 'katex-js');
      const ready = ok && Boolean((window as any).katex?.renderToString);
      if (!ready) katexPromise = null;
      return ready;
    })();
  }
  return katexPromise;
}

export async function ensureMathJaxLoaded(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if ((window as any).MathJax?.tex2svg) return true;
  if (!mathJaxPromise) {
    mathJaxPromise = (async () => {
      if (!(window as any).MathJax) {
        (window as any).MathJax = {
          tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']],
          },
          svg: { fontCache: 'none' },
          options: { enableMenu: false },
        };
      }
      const ok = await loadScript(MATHJAX_JS_URL, 'mathjax-svg', 10000);
      const ready = ok && Boolean((window as any).MathJax?.tex2svg);
      if (!ready) mathJaxPromise = null;
      return ready;
    })();
  }
  return mathJaxPromise;
}

export async function ensurePdfMakeLoaded(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const pm = (window as any).pdfMake;
  if (pm?.createPdf && pm?.vfs) {
    registerPdfMakeLayouts();
    return true;
  }
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const coreOk = await loadScript(PDFMAKE_JS_URL, 'pdfmake-core', 10000);
      if (!coreOk || !(window as any).pdfMake?.createPdf) {
        pdfMakePromise = null;
        return false;
      }
      // vfs_fonts attaches fonts to window.pdfMake.vfs, so it must load after core pdfmake
      const vfsOk = await loadScript(PDFMAKE_VFS_URL, 'pdfmake-vfs', 10000);
      const ready = vfsOk && Boolean((window as any).pdfMake?.createPdf);
      if (ready) {
        registerPdfMakeLayouts();
      } else {
        pdfMakePromise = null;
      }
      return ready;
    })();
  }
  return pdfMakePromise;
}

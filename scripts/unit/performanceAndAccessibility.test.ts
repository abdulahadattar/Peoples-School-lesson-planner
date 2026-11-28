import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  ensureKatexLoaded,
  ensureMathJaxLoaded,
  ensurePdfMakeLoaded,
  registerPdfMakeLayouts,
} from '../../services/export/externalLibs';

interface TestHarness {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  itAsync: (name: string, fn: () => Promise<void>) => Promise<void>;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
}

export async function runPerformanceAndAccessibilityTests({
  describe,
  it,
  itAsync,
  eq,
}: TestHarness): Promise<void> {
  const root = process.cwd();

  describe('index.html & lazy external library loading');
  it('adds Firebase and Google API preconnect hints and defers math/pdf bundles', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    eq(html.includes('href="https://phssjportal.firebaseapp.com"'), true);
    eq(html.includes('href="https://apis.google.com"'), true);
    eq(/katex/i.test(html), false, 'katex must not be eagerly loaded in index.html');
    eq(/mathjax|tex-svg\.js/i.test(html), false, 'mathjax must not be eagerly loaded in index.html');
    eq(/pdfmake|vfs_fonts/i.test(html), false, 'pdfmake must not be eagerly loaded in index.html');
  });

  await itAsync('externalLibs resolves safely in Node without throwing', async () => {
    eq(await ensureKatexLoaded(), false);
    eq(await ensureMathJaxLoaded(), false);
    eq(await ensurePdfMakeLoaded(), false);
  });

  it('registerPdfMakeLayouts attaches lessonPlanHeader when pdfMake exists', () => {
    const prev = (globalThis as any).pdfMake;
    try {
      const mockPdfMake: any = { tableLayouts: {} };
      (globalThis as any).pdfMake = mockPdfMake;
      registerPdfMakeLayouts();
      eq(typeof mockPdfMake.tableLayouts.lessonPlanHeader, 'object');
      eq(typeof mockPdfMake.tableLayouts.lessonPlanHeader.hLineWidth, 'function');
    } finally {
      if (prev === undefined) {
        delete (globalThis as any).pdfMake;
      } else {
        (globalThis as any).pdfMake = prev;
      }
    }
  });

  describe('compressed PNG logo assets & explicit dimensions');
  await itAsync('school logos remain valid compact PNGs matching display bounds', async () => {
    const phssjBuf = fs.readFileSync(path.join(root, 'public/logos/phssj.png'));
    const ziauddinBuf = fs.readFileSync(path.join(root, 'public/logos/ziauddin-university.png'));

    // Valid PNG magic header so pdf-lib embedPng keeps working
    eq(phssjBuf.subarray(0, 4).toString('hex'), '89504e47');
    eq(ziauddinBuf.subarray(0, 4).toString('hex'), '89504e47');

    eq(phssjBuf.length < 20_000, true, `phssj.png too large: ${phssjBuf.length}`);
    eq(ziauddinBuf.length < 20_000, true, `ziauddin-university.png too large: ${ziauddinBuf.length}`);

    const phssjMeta = await sharp(phssjBuf).metadata();
    const ziauddinMeta = await sharp(ziauddinBuf).metadata();
    eq(phssjMeta.width, 112);
    eq(phssjMeta.height, 112);
    eq(ziauddinMeta.width, 240);
    eq(ziauddinMeta.height, 73);
  });

  describe('accessibility heading hierarchy & contrast');
  it('HomeView renders sequential h1 -> h2 -> h3 headings without opacity-0 delay', () => {
    const home = fs.readFileSync(path.join(root, 'components/HomeView.tsx'), 'utf8');
    const h1Pos = home.indexOf('<h1');
    const h2Pos = home.indexOf('<h2');
    const h3Pos = home.indexOf('<h3');
    eq(h1Pos > 0 && h2Pos > h1Pos && h3Pos > h2Pos, true);
    eq(home.includes('initial={{ opacity: 0'), false);
  });

  it('AppSidebar avoids h3 before h1 and uses high-contrast section headers', () => {
    const sidebar = fs.readFileSync(path.join(root, 'components/navigation/AppSidebar.tsx'), 'utf8');
    eq(sidebar.includes('<h3'), false);
    eq(sidebar.includes('text-slate-400 dark:text-slate-500'), false);
  });

  it('Logo and MarksheetA4Preview declare explicit width and height on img tags', () => {
    const logo = fs.readFileSync(path.join(root, 'components/Logo.tsx'), 'utf8');
    const marksheet = fs.readFileSync(path.join(root, 'components/marksheets/MarksheetA4Preview.tsx'), 'utf8');
    eq((logo.match(/width=\{/g) || []).length, 2);
    eq((logo.match(/height=\{/g) || []).length, 2);
    eq((marksheet.match(/width=\{/g) || []).length, 3);
    eq((marksheet.match(/height=\{/g) || []).length, 3);
  });
}

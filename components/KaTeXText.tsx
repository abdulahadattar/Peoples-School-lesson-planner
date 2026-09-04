import React, { useEffect, useRef } from 'react';
import { isFormulaText, MATH_REGEX } from '../services/mathDetection';

declare global {
  interface Window {
    katex?: {
      renderToString: (latex: string, options?: any) => string;
    };
  }
}

interface KaTeXTextProps {
  text: string;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'li';
}



/**
 * Renders text with inline KaTeX equation support.
 *
 * Splits the text into prose and $...$/$$...$$ math segments and renders each
 * math segment with KaTeX directly (no dependence on the auto-render script).
 * If the KaTeX CDN has not finished loading when a segment renders, it retries
 * briefly; if KaTeX is permanently unavailable the math degrades to readable
 * plain text (delimiters removed) rather than showing raw LaTeX.
 */
const KaTeXText: React.FC<KaTeXTextProps> = ({ text, className = '', as: Tag = 'span' }) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: number | undefined;
    let attempts = 0;

    const draw = () => {
      el.textContent = '';
      const frag = document.createDocumentFragment();
      let last = 0;
      MATH_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MATH_REGEX.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

        const token = m[0];
        const display = token.startsWith('$$');
        const latex = display ? token.slice(2, -2) : token.slice(1, -1);

        // Prose wrongly wrapped in delimiters ("$Bios$") must stay text —
        // same gate the DOCX/PDF exporters apply, so surfaces never disagree.
        if (!isFormulaText(latex) && /[A-Za-z]/.test(latex)) {
          frag.appendChild(document.createTextNode(latex));
          last = m.index + token.length;
          continue;
        }

        if (window.katex?.renderToString) {
          const html = window.katex.renderToString(latex, {
            displayMode: display,
            throwOnError: false,
            strict: 'ignore',
          });
          const span = document.createElement('span');
          span.innerHTML = html;
          if (display) {
            span.style.display = 'block';
            span.style.textAlign = 'center';
            span.style.margin = '4px 0';
          }
          frag.appendChild(span);
        } else {
          // KaTeX unavailable — readable fallback instead of raw delimiters
          frag.appendChild(document.createTextNode(latex));
        }
        last = m.index + token.length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      el.appendChild(frag);
    };

    const tryDraw = () => {
      draw();
      // KaTeX loads async from the CDN; retry for a few seconds if it is late
      if (!window.katex?.renderToString && attempts < 24) {
        attempts += 1;
        timer = window.setTimeout(tryDraw, 250);
      }
    };

    tryDraw();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [text]);

  return <Tag ref={ref as any} className={className} />;
};

export default KaTeXText;

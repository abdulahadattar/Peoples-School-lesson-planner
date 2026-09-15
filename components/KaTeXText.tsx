import React, { useEffect, useRef, useState } from 'react';
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
  mathScale?: number;
}

/**
 * Renders text with inline KaTeX equation support.
 * Supports dynamic manual font scaling for equations.
 */
const KaTeXText: React.FC<KaTeXTextProps> = ({ text, className = '', as: Tag = 'span', mathScale }) => {
  const ref = useRef<HTMLElement>(null);
  const [scale, setScale] = useState<number>(() => {
    if (mathScale !== undefined) return mathScale;
    const saved = localStorage.getItem('phssj_math_scale');
    return saved ? Number(saved) || 85 : 85;
  });

  useEffect(() => {
    if (mathScale !== undefined) {
      setScale(mathScale);
    }
  }, [mathScale]);

  useEffect(() => {
    const handleScaleChange = (e: any) => {
      const newScale = e.detail?.scale || Number(localStorage.getItem('phssj_math_scale')) || 85;
      if (mathScale === undefined) {
        setScale(newScale);
      }
    };
    window.addEventListener('phssj-math-scale-changed', handleScaleChange);
    return () => window.removeEventListener('phssj-math-scale-changed', handleScaleChange);
  }, [mathScale]);

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

        // Prose wrongly wrapped in delimiters ("$Bios$") must stay text
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
          span.className = 'inline-katex-container';
          span.innerHTML = html;
          const scaleMultiplier = (scale || 100) / 100;
          span.style.fontSize = `${scaleMultiplier * 1.05}em`;
          span.style.verticalAlign = 'middle';
          if (display) {
            span.style.display = 'block';
            span.style.textAlign = 'center';
            span.style.margin = '6px 0';
          } else {
            span.style.display = 'inline-block';
            span.style.padding = '0 2px';
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
  }, [text, scale]);

  return <Tag ref={ref as any} className={className} />;
};

export default KaTeXText;

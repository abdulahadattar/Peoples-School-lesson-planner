import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    renderMathInElement?: (element: HTMLElement, options?: any) => void;
  }
}

interface KaTeXTextProps {
  text: string;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'li';
}

/**
 * Renders text with inline KaTeX equation support.
 * Uses imperative textContent + renderMathInElement to avoid React stale text node issues.
 */
const KaTeXText: React.FC<KaTeXTextProps> = ({ text, className = '', as: Tag = 'span' }) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set text imperatively so React doesn't retain replaced nodes
    el.textContent = text;

    if (window.renderMathInElement) {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    }
  }, [text]);

  return <Tag ref={ref as any} className={className} />;
};

export default KaTeXText;

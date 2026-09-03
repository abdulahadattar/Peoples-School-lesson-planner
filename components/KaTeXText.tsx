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
 * Detects $...$ and $$...$$ delimiters and renders them as proper math.
 */
const KaTeXText: React.FC<KaTeXTextProps> = ({ text, className = '', as: Tag = 'span' }) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && window.renderMathInElement) {
      window.renderMathInElement(ref.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      });
    }
  }, [text]);

  return (
    <Tag ref={ref as any} className={className}>
      {text}
    </Tag>
  );
};

export default KaTeXText;

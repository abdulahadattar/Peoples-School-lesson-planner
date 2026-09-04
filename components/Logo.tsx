import React from 'react';

interface LogoProps {
  className?: string;
  alt?: string;
}

/** Peoples Higher Secondary School Jamshoro (PHSSJ) circular emblem. */
export const PhssjLogo: React.FC<LogoProps> = ({ className = 'h-10 w-10', alt = 'PHSSJ' }) => (
  <img src="/logos/phssj.png" alt={alt} className={`${className} object-contain select-none`} draggable={false} />
);

/** Ziauddin University emblem + wordmark. */
export const ZiauddinLogo: React.FC<LogoProps> = ({
  className = 'h-8 w-auto',
  alt = 'Ziauddin University',
}) => (
  <img
    src="/logos/ziauddin-university.png"
    alt={alt}
    className={`${className} object-contain select-none`}
    draggable={false}
  />
);
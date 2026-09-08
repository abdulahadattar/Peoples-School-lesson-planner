import React, { useState } from 'react';

interface LogoProps {
  className?: string;
  alt?: string;
}

/** Peoples Higher Secondary School Jamshoro (PHSSJ) circular emblem with graceful fallback. */
export const PhssjLogo: React.FC<LogoProps> = ({ className = 'h-10 w-10', alt = 'PHSSJ' }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 via-blue-600 to-emerald-600 text-white font-bold text-xs select-none shadow-soft`}
        title="Peoples Higher Secondary School Jamshoro"
      >
        <span>PHSSJ</span>
      </div>
    );
  }

  return (
    <img
      src="/logos/phssj.png"
      alt={alt}
      onError={() => setHasError(true)}
      className={`${className} object-contain select-none transition-transform duration-300 hover:scale-105`}
      draggable={false}
    />
  );
};

/** Ziauddin University emblem + wordmark with graceful fallback. */
export const ZiauddinLogo: React.FC<LogoProps> = ({
  className = 'h-8 w-auto',
  alt = 'Ziauddin University',
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`${className} flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold border border-blue-200 dark:border-blue-900 select-none`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
        <span>Ziauddin University</span>
      </div>
    );
  }

  return (
    <img
      src="/logos/ziauddin-university.png"
      alt={alt}
      onError={() => setHasError(true)}
      className={`${className} object-contain select-none transition-transform duration-300 hover:scale-105`}
      draggable={false}
    />
  );
};

/** Unified header/card brand badge for PHSSJ & Ziauddin affiliation. */
export const SchoolBrandBadge: React.FC<{
  compact?: boolean;
  showAffiliation?: boolean;
}> = ({ compact = false, showAffiliation = true }) => (
  <div className="flex items-center gap-3">
    <div className={`${compact ? 'w-9 h-9' : 'w-11 h-11'} rounded-2xl bg-white shadow-card border border-brand-border flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0`}>
      <PhssjLogo className="w-full h-full" />
    </div>
    <div className="leading-tight min-w-0">
      <h3 className={`${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} font-bold text-brand-text-primary tracking-tight truncate`}>
        PHSSJ Lesson Planner
      </h3>
      {showAffiliation && (
        <p className="text-[10px] text-brand-text-secondary truncate">
          Peoples Higher Secondary School Jamshoro
        </p>
      )}
    </div>
  </div>
);

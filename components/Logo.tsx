import React, { useState, useEffect } from 'react';
import type { SchoolConfig } from '../services/schoolConfig/types';

interface LogoProps {
  className?: string;
  alt?: string;
  src?: string;
}

/** Peoples Higher Secondary School Jamshoro (PHSSJ) circular emblem with graceful fallback. */
export const PhssjLogo: React.FC<LogoProps> = ({
  className = 'w-10 h-10',
  alt = 'PHSSJ',
  src = '/logos/phssj.png',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return (
      <div
        className={`${className} aspect-square flex items-center justify-center rounded-full brand-gradient text-white font-bold text-xs select-none shadow-sm`}
        title={alt}
      >
        <span>PHSSJ</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={112}
      height={112}
      onError={() => setHasError(true)}
      className={`${className} aspect-square object-contain rounded-full select-none shrink-0`}
      draggable={false}
    />
  );
};

/** Affiliation emblem + wordmark with graceful fallback. */
export const ZiauddinLogo: React.FC<LogoProps> = ({
  className = 'h-7 w-auto',
  alt = 'Ziauddin University',
  src = '/logos/ziauddin-university.png',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    return (
      <div
        className={`${className} flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold border border-blue-200 dark:border-blue-900 select-none`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
        <span>{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={240}
      height={73}
      onError={() => setHasError(true)}
      className={`${className} object-contain select-none shrink-0`}
      draggable={false}
    />
  );
};

/** Unified header/card brand badge driven by live SchoolConfig. */
export const SchoolBrandBadge: React.FC<{
  compact?: boolean;
  showAffiliation?: boolean;
  schoolConfig?: Pick<SchoolConfig, 'schoolName' | 'schoolLogoUrl'> | null;
}> = ({ compact = false, showAffiliation = true, schoolConfig }) => {
  const resolvedSchoolName =
    schoolConfig?.schoolName || 'Peoples Higher Secondary School Jamshoro';

  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? 'w-9 h-9' : 'w-11 h-11'} rounded-full bg-white dark:bg-slate-900 shadow-sm border border-brand-border flex items-center justify-center shrink-0 p-0.5 ring-1 ring-black/5 dark:ring-white/10`}>
        <PhssjLogo
          className="w-full h-full rounded-full"
          alt={resolvedSchoolName}
          src={schoolConfig?.schoolLogoUrl}
        />
      </div>
      <div className="leading-tight min-w-0">
        <p className={`${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} font-bold text-brand-text-primary tracking-tight truncate`}>
          PHSSJ Portal
        </p>
        {showAffiliation && (
          <p className="text-[10px] text-brand-text-secondary truncate">
            {resolvedSchoolName}
          </p>
        )}
      </div>
    </div>
  );
};

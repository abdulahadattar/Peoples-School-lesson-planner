import React from 'react';

interface SkeletonProps {
  className?: string;
}

/** Shimmering placeholder block. Combine with width/height utilities. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);

/** A compact set of skeletons shaped like list rows (used for SLO loading). */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 4,
  className = '',
}) => (
  <div className={`space-y-3 ${className}`} aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-3 p-3">
        <Skeleton className="h-4 w-4 rounded mt-0.5" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);
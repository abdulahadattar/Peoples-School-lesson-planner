import React, { useState, useEffect, useMemo } from 'react';
import { ZoomIn } from 'lucide-react';
import { StudentDossier } from '../../types/documentArchive';
import { getInitials, getAvatarGradient } from '../../services/identityNormalization';

export interface StudentAvatarProps {
  name: string;
  grNo?: string;
  avatarUrl?: string;
  /** Tried in order if avatarUrl 404s, e.g. a STUDENT_PHOTO found in the dossier. */
  fallbackUrls?: string[];
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
}

/**
 * Resolves the best available photo for a student. The dossier-level avatarUrl is
 * preferred, but if it is missing or its file 404s we fall back to any successfully
 * classified STUDENT_PHOTO document in the same dossier.
 */
export const resolveAvatarUrl = (dossier?: StudentDossier): string | undefined => {
  if (!dossier) return undefined;
  if (dossier.avatarUrl) return dossier.avatarUrl;
  const photo = dossier.documents?.find(
    (d) => d.classification === 'STUDENT_PHOTO' && d.status !== 'duplicate' && d.url
  );
  return photo?.url;
};

export const StudentAvatar: React.FC<StudentAvatarProps> = React.memo(({
  name,
  grNo = '',
  avatarUrl,
  fallbackUrls,
  size = 'md',
  onClick,
}) => {
  const candidates = useMemo(
    () => [avatarUrl, ...(fallbackUrls || [])].filter((u): u is string => Boolean(u)),
    [avatarUrl, fallbackUrls]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  // Reset the candidate cursor whenever the set of candidate photos changes.
  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const activeUrl = candidates[candidateIndex];

  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-14 h-14 text-base',
  }[size];

  const initials = useMemo(() => getInitials(name), [name]);
  const gradientClass = useMemo(() => getAvatarGradient(grNo || name), [grNo, name]);

  if (activeUrl) {
    return (
      <div
        onClick={onClick}
        className={`${sizeClasses} rounded-full border border-black/10 dark:border-white/15 overflow-hidden flex-shrink-0 shadow-xs relative group/avatar ${
          onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all' : ''
        }`}
        title={`${name} (Click to inspect photo)`}
      >
        <img
          src={activeUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setCandidateIndex((i) => i + 1)}
          loading="lazy"
        />
        {onClick && (
          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
            <ZoomIn className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses} rounded-full bg-gradient-to-br ${gradientClass} font-bold flex items-center justify-center flex-shrink-0 shadow-xs select-none border border-white/25 ${
        onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      }`}
      title={name}
    >
      {initials}
    </div>
  );
});

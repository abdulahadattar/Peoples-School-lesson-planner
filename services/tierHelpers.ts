/**
 * tierHelpers.ts — Classification and minimalist visual indicators
 * for Primary, Elementary, Middle, and Secondary classes and teachers.
 */

import { Teacher } from '../types';

export type ClassTier = 'primary' | 'elementary' | 'middle' | 'secondary';

export interface TierConfig {
  id: ClassTier;
  label: string;
  badgeClass: string;
  dotClass: string;
  borderAccent: string;
  classBadgeClass: string;
  subtleTagClass: string;
}

export const TIER_CONFIG: Record<ClassTier, TierConfig> = {
  primary: {
    id: 'primary',
    label: 'Primary',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    dotClass: 'bg-emerald-500',
    borderAccent: 'border-l-2 border-l-emerald-500',
    classBadgeClass: 'border-emerald-200 text-emerald-800 bg-emerald-50/60 dark:border-emerald-800/60 dark:text-emerald-300 dark:bg-emerald-950/20',
    subtleTagClass: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/80 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800/60',
  },
  elementary: {
    id: 'elementary',
    label: 'Elementary',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60',
    dotClass: 'bg-teal-500',
    borderAccent: 'border-l-2 border-l-teal-500',
    classBadgeClass: 'border-teal-200 text-teal-800 bg-teal-50/60 dark:border-teal-800/60 dark:text-teal-300 dark:bg-teal-950/20',
    subtleTagClass: 'text-teal-700 bg-teal-50/80 border-teal-200/80 dark:text-teal-300 dark:bg-teal-950/30 dark:border-teal-800/60',
  },
  middle: {
    id: 'middle',
    label: 'Middle',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
    dotClass: 'bg-indigo-500',
    borderAccent: 'border-l-2 border-l-indigo-500',
    classBadgeClass: 'border-indigo-200 text-indigo-800 bg-indigo-50/60 dark:border-indigo-800/60 dark:text-indigo-300 dark:bg-indigo-950/20',
    subtleTagClass: 'text-indigo-700 bg-indigo-50/80 border-indigo-200/80 dark:text-indigo-300 dark:bg-indigo-950/30 dark:border-indigo-800/60',
  },
  secondary: {
    id: 'secondary',
    label: 'Secondary',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    dotClass: 'bg-blue-500',
    borderAccent: 'border-l-2 border-l-blue-500',
    classBadgeClass: 'border-blue-200 text-blue-800 bg-blue-50/60 dark:border-blue-800/60 dark:text-blue-300 dark:bg-blue-950/20',
    subtleTagClass: 'text-blue-700 bg-blue-50/80 border-blue-200/80 dark:text-blue-300 dark:bg-blue-950/30 dark:border-blue-800/60',
  },
};

/**
 * Returns the school tier for a class label.
 * Class IV -> Primary
 * Class V -> Elementary
 * Class VI, VII, VIII -> Middle
 * Class IX, X, XI, XII -> Secondary
 */
export function getClassTier(classLabel: string): ClassTier {
  const lbl = classLabel.trim().toUpperCase();
  if (lbl.startsWith('IV')) return 'primary';
  if (lbl.startsWith('V-') || lbl === 'V') return 'elementary';
  if (lbl.startsWith('VI') || lbl.startsWith('VII') || lbl.startsWith('VIII')) return 'middle';
  return 'secondary';
}

/**
 * Derives unique tiers a teacher is assigned to across all their subjects.
 */
export function getTeacherTiers(teacher: Teacher): ClassTier[] {
  const tiers = new Set<ClassTier>();
  for (const s of teacher.subjects || []) {
    for (const sec of s.sections || []) {
      tiers.add(getClassTier(sec));
    }
  }
  return [...tiers];
}

/**
 * Returns the primary tier descriptor for a teacher.
 */
export function getTeacherTierHint(teacher: Teacher): {
  label: string;
  config: TierConfig;
  isMulti: boolean;
} {
  const tiers = getTeacherTiers(teacher);
  if (tiers.length === 0) {
    return {
      label: 'Secondary',
      config: TIER_CONFIG.secondary,
      isMulti: false,
    };
  }
  if (tiers.length === 1) {
    const t = tiers[0];
    return {
      label: TIER_CONFIG[t].label,
      config: TIER_CONFIG[t],
      isMulti: false,
    };
  }
  // Multi-tier: return predominant or general descriptor
  const hasPrimary = tiers.includes('primary') || tiers.includes('elementary');
  const hasMiddle = tiers.includes('middle');
  const hasSec = tiers.includes('secondary');
  
  if (hasPrimary && hasMiddle && !hasSec) {
    return {
      label: 'Prim / Mid',
      config: TIER_CONFIG.primary,
      isMulti: true,
    };
  }
  if (hasMiddle && hasSec && !hasPrimary) {
    return {
      label: 'Mid / Sec',
      config: TIER_CONFIG.middle,
      isMulti: true,
    };
  }
  return {
    label: 'All Grades',
    config: TIER_CONFIG.secondary,
    isMulti: true,
  };
}

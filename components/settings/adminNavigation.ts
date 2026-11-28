import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  GraduationCap,
  Users,
  Clock,
  Calendar,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  DEFAULT_SCHOOL_CONFIG,
  SchoolConfig,
  sanitizeSchoolConfig,
} from '../../services/schoolConfigService';

export type AdminPillarId = 'institution' | 'schedule' | 'governance';

export type SettingsTab =
  | 'identity'
  | 'classes'
  | 'teachers'
  | 'periods'
  | 'timetable'
  | 'auditor'
  | 'safeguards';

export interface AdminNavItem {
  id: SettingsTab;
  pillar: AdminPillarId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface AdminPillar {
  id: AdminPillarId;
  label: string;
  shortLabel: string;
  description: string;
  items: AdminNavItem[];
}

export const ADMIN_PILLARS: readonly AdminPillar[] = [
  {
    id: 'institution',
    label: 'Institution & Academics',
    shortLabel: 'Institution',
    description: 'School identity, classes, and faculty roster',
    items: [
      {
        id: 'identity',
        pillar: 'institution',
        label: 'School Identity',
        description: 'Official name, affiliation, leadership, crests, and signature',
        icon: Building2,
      },
      {
        id: 'classes',
        pillar: 'institution',
        label: 'Classrooms & Sections',
        description: 'Grades, rooms, capacities, class advisors, and enrollment',
        icon: GraduationCap,
      },
      {
        id: 'teachers',
        pillar: 'institution',
        label: 'Faculty Roster',
        description: 'Teachers, designations, and subject assignments',
        icon: Users,
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule & Operations',
    shortLabel: 'Schedule',
    description: 'Bell timings, timetable grid, and clash auditor',
    items: [
      {
        id: 'periods',
        pillar: 'schedule',
        label: 'Bell Schedules',
        description: 'Assembly, regular periods, recess, and Friday timings',
        icon: Clock,
      },
      {
        id: 'timetable',
        pillar: 'schedule',
        label: 'Master Timetable',
        description: 'Class grids, faculty workload, and spreadsheet sync',
        icon: Calendar,
      },
      {
        id: 'auditor',
        pillar: 'schedule',
        label: 'Conflict Auditor',
        description: 'Inspect and resolve double-booked faculty slots',
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: 'governance',
    label: 'Integrations & Governance',
    shortLabel: 'Governance',
    description: 'Record editing locks, backups, and baseline restore',
    items: [
      {
        id: 'safeguards',
        pillar: 'governance',
        label: 'Access & Backup',
        description: 'Student sheet locks, backup archive, and baseline reset',
        icon: ShieldCheck,
      },
    ],
  },
] as const;

export function getAllAdminNavItems(): AdminNavItem[] {
  return ADMIN_PILLARS.flatMap((pillar) => pillar.items);
}

export function getPillarForTab(tab: SettingsTab): AdminPillar {
  return (
    ADMIN_PILLARS.find((pillar) => pillar.items.some((item) => item.id === tab)) ||
    ADMIN_PILLARS[0]
  );
}

export function getTabMeta(tab: SettingsTab): AdminNavItem {
  const found = getAllAdminNavItems().find((item) => item.id === tab);
  return found || ADMIN_PILLARS[0].items[0];
}

export function serializeEditableConfig(cfg: SchoolConfig): string {
  const { updatedAt: _ts, updatedBy: _by, ...rest } = cfg;
  return JSON.stringify(rest);
}

export function hasUnsavedConfigChanges(working: SchoolConfig, saved: SchoolConfig): boolean {
  return serializeEditableConfig(working) !== serializeEditableConfig(saved);
}

export function buildSchoolConfigBackupPayload(config: SchoolConfig): string {
  const clean = sanitizeSchoolConfig(config);
  return JSON.stringify(
    {
      schoolBackupVersion: 1,
      exportedAt: new Date().toISOString(),
      config: clean,
    },
    null,
    2
  );
}

export type BackupParseResult =
  | { ok: true; config: SchoolConfig }
  | { ok: false; error: string };

export function parseSchoolConfigBackup(rawJson: string): BackupParseResult {
  const trimmed = (rawJson || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'The selected backup file is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'The selected file is not a valid school settings backup.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'The backup file format is invalid.' };
  }

  const candidate =
    'config' in parsed && (parsed as { config?: unknown }).config && typeof (parsed as { config?: unknown }).config === 'object'
      ? ((parsed as { config: Partial<SchoolConfig> }).config)
      : (parsed as Partial<SchoolConfig>);

  const hasSchoolIdentity =
    typeof candidate.schoolName === 'string' && candidate.schoolName.trim().length > 0;
  const hasAnyDomainSection =
    Array.isArray(candidate.classes) ||
    Array.isArray(candidate.teachers) ||
    Array.isArray(candidate.periods);

  if (!hasSchoolIdentity || !hasAnyDomainSection) {
    return {
      ok: false,
      error: 'This file does not contain recognized school classes, faculty, or bell settings.',
    };
  }

  const sanitized = sanitizeSchoolConfig({
    ...DEFAULT_SCHOOL_CONFIG,
    ...candidate,
    updatedAt: Date.now(),
    updatedBy: candidate.updatedBy || 'Admin Backup Restore',
  });

  return { ok: true, config: sanitized };
}

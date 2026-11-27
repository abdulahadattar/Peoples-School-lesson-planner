import { Teacher } from '../../../types';
import { SlotPart } from '../types';
import {
  isKnownSubject,
  normalizeSubject,
  resolveByName,
  resolveTeacher,
  subjectMatches,
} from '../../teacherRoster';

export interface ParsedSlot {
  label: string;
  parts: SlotPart[];
  teachers: Teacher[];
  empty: boolean;
  isParallel: boolean;
  rawValue: string;
}

export function parseTimetableCell(
  rawVal: string,
  classLabel: string,
  teachers: Teacher[],
): ParsedSlot {
  const raw = (rawVal || '').trim();

  if (!raw || raw === '—' || raw === '-' || raw.toLowerCase() === 'free' || raw.toLowerCase() === 'free period') {
    return {
      label: 'Free period',
      parts: [],
      teachers: [],
      empty: true,
      isParallel: false,
      rawValue: raw,
    };
  }

  const rawParts = raw.split('/').map(s => s.trim()).filter(Boolean);

  if (rawParts.length === 1) {
    const single = rawParts[0];
    const parenMatch = single.match(/^(.+?)\s*\((.+?)\)$/);
    if (parenMatch) {
      const subject = normalizeSubject(parenMatch[1]);
      const explicitTeacherName = parenMatch[2].trim();
      const directTeacher = teachers.find(
        t => t.name.toLowerCase() === explicitTeacherName.toLowerCase(),
      ) || resolveByName(explicitTeacherName, teachers) || resolveTeacher(subject, classLabel, teachers);

      return {
        label: subject,
        parts: [{ subject, teacher: directTeacher }],
        teachers: directTeacher ? [directTeacher] : [],
        empty: false,
        isParallel: false,
        rawValue: raw,
      };
    }

    const norm = normalizeSubject(single);
    const teacher = resolveTeacher(norm, classLabel, teachers);
    return {
      label: norm,
      parts: [{ subject: norm, teacher }],
      teachers: teacher ? [teacher] : [],
      empty: false,
      isParallel: false,
      rawValue: raw,
    };
  }

  // Multi-part handling (parallel or subject / teacher)
  const normFirst = normalizeSubject(rawParts[0]);
  const normSecond = normalizeSubject(rawParts[1]);

  if (rawParts.length === 2 && normFirst === normSecond) {
    const teacher = resolveTeacher(normFirst, classLabel, teachers);
    return {
      label: normFirst,
      parts: [{ subject: normFirst, teacher }],
      teachers: teacher ? [teacher] : [],
      empty: false,
      isParallel: false,
      rawValue: raw,
    };
  }

  const firstIsSubject = isKnownSubject(normFirst);
  const secondIsSubject = isKnownSubject(normSecond);
  const secondIsTeacherName = !secondIsSubject && Boolean(resolveByName(rawParts[1], teachers));

  if (firstIsSubject && secondIsTeacherName && rawParts.length === 2) {
    const assignedTeacher = resolveByName(rawParts[1], teachers);
    return {
      label: normFirst,
      parts: [{ subject: normFirst, teacher: assignedTeacher }],
      teachers: assignedTeacher ? [assignedTeacher] : [],
      empty: false,
      isParallel: false,
      rawValue: raw,
    };
  }

  const parts: SlotPart[] = [];
  const teachersInSlot: Teacher[] = [];

  for (const partRaw of rawParts) {
    const parenMatch = partRaw.match(/^(.+?)\s*\((.+?)\)$/);
    if (parenMatch) {
      const sub = normalizeSubject(parenMatch[1]);
      const explicitName = parenMatch[2].trim();
      const t = teachers.find(x => x.name.toLowerCase() === explicitName.toLowerCase())
        || resolveByName(explicitName, teachers)
        || resolveTeacher(sub, classLabel, teachers);
      parts.push({ subject: sub, teacher: t });
      if (t && !teachersInSlot.some(existing => existing.id === t.id)) {
        teachersInSlot.push(t);
      }
    } else {
      const sub = normalizeSubject(partRaw);
      const t = resolveTeacher(sub, classLabel, teachers);
      parts.push({ subject: sub, teacher: t });
      if (t && !teachersInSlot.some(existing => existing.id === t.id)) {
        teachersInSlot.push(t);
      }
    }
  }

  const combinedLabel = parts.map(p => p.subject).join(' / ');
  return {
    label: combinedLabel,
    parts,
    teachers: teachersInSlot,
    empty: false,
    isParallel: parts.length > 1,
    rawValue: raw,
  };
}

export function formatTimetableCell(
  subject: string,
  teacherOverride?: string | null,
  parallelSubject?: string | null,
  parallelTeacherOverride?: string | null,
): string {
  const cleanSub = (subject || '').trim();
  if (!cleanSub || cleanSub.toLowerCase() === 'free' || cleanSub === '—') return '—';

  let firstPart = cleanSub;
  if (teacherOverride && teacherOverride.trim()) {
    firstPart = `${cleanSub} (${teacherOverride.trim()})`;
  }

  const cleanParallel = (parallelSubject || '').trim();
  if (cleanParallel && cleanParallel.toLowerCase() !== 'none' && cleanParallel !== '—') {
    let secondPart = cleanParallel;
    if (parallelTeacherOverride && parallelTeacherOverride.trim()) {
      secondPart = `${cleanParallel} (${parallelTeacherOverride.trim()})`;
    }
    return `${firstPart} / ${secondPart}`;
  }

  return firstPart;
}

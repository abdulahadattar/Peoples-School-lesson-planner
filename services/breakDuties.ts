/**
 * breakDuties.ts — Ground duties schedule for People's Higher Secondary School Jamshoro.
 * 
 * Tracks:
 * 1. Break Duties Schedule (Boys Ground & Girls Ground)
 * 2. Leave Time Duties Schedule (Boys Ground & Girls Ground)
 * Organized by day of the week (Monday through Saturday).
 */

import { DayKey } from './timetable';
import { Teacher } from '../types';

export interface GroundDutyAssignment {
  boysGround: string[];
  girlsGround: string[];
}

export interface DayDutiesSchedule {
  dayName: string;
  breakDuty: GroundDutyAssignment;
  leaveDuty: GroundDutyAssignment;
}

export const DUTIES_SCHEDULE: Record<DayKey, DayDutiesSchedule> = {
  mon: {
    dayName: 'Monday',
    breakDuty: {
      boysGround: ['Shubhan', 'Kamran', 'Atta Muhammad'],
      girlsGround: ['Shahida', 'Madiha'],
    },
    leaveDuty: {
      boysGround: ['Kareem', 'Bahadur'],
      girlsGround: ['Dania', 'Aneela'],
    },
  },
  tue: {
    dayName: 'Tuesday',
    breakDuty: {
      boysGround: ['Feroz', 'Hashim', 'Bahadur'],
      girlsGround: ['Shagufta', 'Dania'],
    },
    leaveDuty: {
      boysGround: ['Atta Muhammad', 'Kamran'],
      girlsGround: ['Shahida', 'Madiha'],
    },
  },
  wed: {
    dayName: 'Wednesday',
    breakDuty: {
      boysGround: ['Ahad', 'Kareem', 'Faizan'],
      girlsGround: ['Asra', 'Mahida'],
    },
    leaveDuty: {
      boysGround: ['Shubhan', 'Ahad'],
      girlsGround: ['Aneela', 'Shagufta'],
    },
  },
  thu: {
    dayName: 'Thursday',
    breakDuty: {
      boysGround: ['Kamran', 'Shubhan', 'Atta Muhammad'],
      girlsGround: ['Shahida', 'Aneela'],
    },
    leaveDuty: {
      boysGround: ['Faizan', 'Hashim'],
      girlsGround: ['Asra', 'Dania'],
    },
  },
  fri: {
    dayName: 'Friday',
    breakDuty: {
      boysGround: ['Bahadur', 'Kareem', 'Hashim'],
      girlsGround: ['Aneela', 'Daniya'],
    },
    leaveDuty: {
      boysGround: ['Feroz', 'Kamran'],
      girlsGround: ['Shahida', 'Madiha'],
    },
  },
  sat: {
    dayName: 'Saturday',
    breakDuty: {
      boysGround: ['Ahad', 'Kamran', 'Feroz'],
      girlsGround: ['Asra', 'Shagufta'],
    },
    leaveDuty: {
      boysGround: ['Bahadur', 'Atta Muhammad'],
      girlsGround: ['Dania', 'Aneela'],
    },
  },
};

/**
 * Normalizes short names from duty sheets to match teacher roster names.
 */
export function matchTeacherForDuty(name: string, teachers: Teacher[]): Teacher | null {
  const norm = name.trim().toLowerCase().replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '');
  
  // Direct name or alias map
  const aliases: Record<string, string> = {
    shubhan: 'shuhban',
    mahida: 'madiha',
    dania: 'daniya',
    kareem: 'karim',
    ahad: 'abdul ahad',
  };

  const target = aliases[norm] ?? norm;

  // 1. Exact match on normalized
  const exact = teachers.find(t => {
    const tClean = t.name.toLowerCase().replace(/^(sir|miss|ma'am|mrs|mr)\s+/i, '').trim();
    return tClean === target || tClean.includes(target) || target.includes(tClean);
  });
  if (exact) return exact;

  // 2. Word boundary match
  return teachers.find(t => {
    const words = t.name.toLowerCase().split(/\s+/);
    return words.includes(target) || words.some(w => w.startsWith(target));
  }) || null;
}

/**
 * Resolves an array of duty name strings to Teacher objects and their status.
 */
export function resolveDutyStaff(
  names: string[],
  teachers: Teacher[],
  absentTeacherIds: string[] = []
): Array<{
  rawName: string;
  teacher: Teacher | null;
  canonicalName: string;
  isAbsent: boolean;
}> {
  return names.map(rawName => {
    const teacher = matchTeacherForDuty(rawName, teachers);
    const isAbsent = teacher ? absentTeacherIds.includes(teacher.id) : false;
    return {
      rawName,
      teacher,
      canonicalName: teacher?.name ?? rawName,
      isAbsent,
    };
  });
}

/**
 * Evaluates whether break duty or leave duty is active right now based on day and minute.
 */
export function getActiveDutyStatus(day: DayKey, minutes: number): 'break' | 'leave' | null {
  if (day === 'fri') {
    // Friday Break: 10:00 AM – 10:30 AM (600 – 630)
    if (minutes >= 595 && minutes <= 635) return 'break';
    // Friday Leave: 11:50 AM – 12:25 PM (710 – 745)
    if (minutes >= 710 && minutes <= 750) return 'leave';
  } else {
    // Regular Days Break: 10:50 AM – 11:20 AM (650 – 680)
    if (minutes >= 645 && minutes <= 685) return 'break';
    // Regular Days Leave: 1:20 PM – 1:55 PM (800 – 835)
    if (minutes >= 795 && minutes <= 840) return 'leave';
  }
  return null;
}

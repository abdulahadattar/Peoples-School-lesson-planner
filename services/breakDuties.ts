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
    // Friday Break: 10:55 AM – 11:35 AM (655 – 695)
    if (minutes >= 655 && minutes <= 710) return 'break';
    // Friday Leave: 12:15 PM – 1:00 PM (735 – 780)
    if (minutes >= 735 && minutes <= 780) return 'leave';
  } else {
    // Regular Days Break: 11:15 AM – 12:05 PM (675 – 725)
    if (minutes >= 670 && minutes <= 730) return 'break';
    // Regular Days Leave: 2:15 PM – 2:50 PM (855 – 890)
    if (minutes >= 850 && minutes <= 895) return 'leave';
  }
  return null;
}

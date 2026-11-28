export type SortField =
  | 'grNo'
  | 'studentName'
  | 'fatherName'
  | 'currentClass'
  | 'gender'
  | 'dob'
  | 'parentContact'
  | 'emergencyContact'
  | 'status'
  | 'bFormNo'
  | 'parentCnic'
  | 'address';

export type SortDirection = 'asc' | 'desc';

export const CLASS_ORDER: Record<string, number> = {
  KACHI: 0,
  KGA: 0,
  KGB: 0,
  NURSERY: 0,
  'PRE-K': 0,
  I: 1,
  '1': 1,
  II: 2,
  '2': 2,
  III: 3,
  '3': 3,
  IV: 4,
  '4': 4,
  V: 5,
  '5': 5,
  VI: 6,
  '6': 6,
  VII: 7,
  '7': 7,
  VIII: 8,
  '8': 8,
  IX: 9,
  '9': 9,
  X: 10,
  '10': 10,
  XI: 11,
  '11': 11,
  XII: 12,
  '12': 12,
};

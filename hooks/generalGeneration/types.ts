import { TeacherInfo } from '../../types';

export type GenerationMode = 'single-slo' | 'whole-chapter' | 'topic';
export type UiExportFormat = 'docx' | 'pdf' | 'both';

export interface GenerationOptions {
  selectedSloIds?: string[];
  exportFormat: UiExportFormat;
  teacherInfo: TeacherInfo;
}

/**
 * Run a promise with a timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

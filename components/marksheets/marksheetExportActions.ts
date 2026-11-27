import type { StudentRecord } from '../../services/sheets/types';
import {
  computeStudentMarksheet,
  formatMarksheetPdfFilename,
} from '../../services/marksheet/calculations';
import {
  downloadMarksheetExcelTemplate,
  importMarksheetWorkbook,
} from '../../services/marksheet/importer';
import {
  generateBatchMarksheetPdf,
  generateSingleMarksheetPdf,
  MarksheetLogoAssets,
  triggerPdfDownload,
} from '../../services/marksheet/pdfGenerator';
import {
  makeMarkEntryKey,
  saveMarksheetConfig,
  saveMarksheetEntries,
} from '../../services/marksheet/storage';
import type {
  ComputedStudentMarksheet,
  GradingSystemType,
  MarksheetConfig,
  MarksheetExamType,
  MarksheetGradeLevel,
  MarksheetRosterStudent,
  StudentMarkEntry,
} from '../../services/marksheet/types';

export function mergeConfigPatch(
  prev: MarksheetConfig,
  patch: Partial<MarksheetConfig>
): MarksheetConfig {
  const merged: MarksheetConfig = {
    ...prev,
    ...patch,
    classTeachers: {
      ...prev.classTeachers,
      ...(patch.classTeachers || {}),
    },
    subjectMaxMarks: patch.subjectMaxMarks || prev.subjectMaxMarks,
  };
  saveMarksheetConfig(merged);
  return merged;
}

export async function importWorkbookFileAction(params: {
  file: File;
  examType: MarksheetExamType;
  academicYear: string;
  onConfig: (patch: Partial<MarksheetConfig>) => void;
  onEntries: (entries: StudentMarkEntry[]) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const { file, examType, academicYear, onConfig, onEntries, showToast } = params;
  const buf = await file.arrayBuffer();
  const result = importMarksheetWorkbook(buf, examType);

  if (result.configPatch) onConfig(result.configPatch);
  if (result.entries.length > 0) onEntries(result.entries);

  if (result.entries.length > 0 && result.configPatch) {
    showToast(`Imported settings and ${result.entries.length} marksheet entries.`, 'success');
  } else if (result.entries.length > 0) {
    showToast(`Imported marks for ${result.entries.length} entries.`, 'success');
  } else if (result.configPatch) {
    showToast(
      `Applied marksheet configuration (${result.configPatch.academicYear || academicYear}).`,
      'success'
    );
  } else {
    showToast('No recognizable marks or settings rows found in that file.', 'error');
  }
}

export function applyImportedEntries(
  prev: Record<string, StudentMarkEntry>,
  incoming: StudentMarkEntry[],
  fallbackExam: MarksheetExamType
): Record<string, StudentMarkEntry> {
  const nextMap = { ...prev };
  const stamp = Date.now();
  for (const entry of incoming) {
    const exam = entry.examType || fallbackExam;
    const key = makeMarkEntryKey(entry.grNo, exam);
    nextMap[key] = {
      ...(prev[key] || {}),
      ...entry,
      examType: exam,
      updatedAt: entry.updatedAt ?? stamp,
      scores: {
        ...(prev[key]?.scores || {}),
        ...entry.scores,
      },
    };
  }
  saveMarksheetEntries(nextMap);
  return nextMap;
}

export async function exportSingleMarksheetPdfAction(params: {
  marksheet: ComputedStudentMarksheet;
  config: MarksheetConfig;
  logos: MarksheetLogoAssets;
}): Promise<string> {
  const bytes = await generateSingleMarksheetPdf(params.marksheet, params.config, params.logos);
  const filename = formatMarksheetPdfFilename(
    params.marksheet.student.grNo,
    params.marksheet.student.studentName
  );
  triggerPdfDownload(bytes, filename);
  return filename;
}

export async function exportBatchMarksheetsPdfAction(params: {
  roster: MarksheetRosterStudent[];
  examEntriesByGr: Record<string, StudentMarkEntry>;
  config: MarksheetConfig;
  examType: MarksheetExamType;
  gradingSystem: GradingSystemType;
  gradeFilter: 'ALL' | MarksheetGradeLevel;
  logos: MarksheetLogoAssets;
  onProgress: (done: number, total: number) => void;
}): Promise<{ filename: string; count: number }> {
  const computedList = params.roster.map((student) =>
    computeStudentMarksheet(
      student,
      params.examEntriesByGr[student.grNo],
      params.config,
      params.examType,
      params.gradingSystem
    )
  );
  const bytes = await generateBatchMarksheetPdf(
    computedList,
    params.config,
    params.logos,
    params.onProgress
  );
  const scopeLabel = params.gradeFilter === 'ALL' ? 'IX-XII' : `Grade_${params.gradeFilter}`;
  const filename = `PHSSJ_All_Marksheets_${scopeLabel}_${params.examType}.pdf`;
  triggerPdfDownload(bytes, filename);
  return { filename, count: computedList.length };
}

export function exportMarksheetTemplateAction(
  students: StudentRecord[],
  entriesMap: Record<string, StudentMarkEntry>,
  examType: MarksheetExamType,
  config: MarksheetConfig
) {
  downloadMarksheetExcelTemplate(students, entriesMap, examType, config);
}

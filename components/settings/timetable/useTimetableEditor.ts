import { useState, useMemo, useRef, useEffect } from 'react';
import { Teacher } from '../../../types';
import {
  SchoolConfig,
  buildMasterTimetableClasses,
  compareClassLabels,
  extractTeachingPeriods,
  lookupClassSubjectsSeed,
  resolveClassConfigForLabel,
} from '../../../services/schoolConfigService';
import { TimetableClassEntry } from '../../../services/timetable';
import {
  auditFullTimetable,
  buildTeacherMasterSchedule,
} from '../../../services/timetableConflictEngine';
import {
  useTimetableSheetSync,
  timetableSheetSignature,
  type TimetablePushResult,
} from '../../../hooks/useTimetableSheetSync';
import { googleSignIn } from '../../../services/googleAuth';
import { ViewMode } from './TimetableToolbar';
import {
  DEFAULT_BASE_PERIODS,
  toClassMap,
  mergeSheetOverLocal,
} from './timetableEditorHelpers';
import { useTimetableCellModal } from './useTimetableCellModal';

export { DEFAULT_BASE_PERIODS, toClassMap, mergeSheetOverLocal };

export function useTimetableEditor(
  config: SchoolConfig,
  teachers: Teacher[],
  onUpdateCustomTimetable: (updated: TimetableClassEntry[]) => void
) {
  const [viewMode, setViewMode] = useState<ViewMode>('class');
  const [classFilter, setClassFilter] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen]);

  const [timetableMap, setTimetableMap] = useState<Record<string, TimetableClassEntry>>(() =>
    toClassMap(buildMasterTimetableClasses(config))
  );

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const configTimetableSig = useMemo(
    () =>
      JSON.stringify({
        periods: config.periods,
        classes: config.classes,
        customTimetable: config.customTimetable,
      }),
    [config.periods, config.classes, config.customTimetable]
  );
  const prevConfigSigRef = useRef<string>(configTimetableSig);

  useEffect(() => {
    if (configTimetableSig === prevConfigSigRef.current) return;
    prevConfigSigRef.current = configTimetableSig;
    if (!hasUnsavedChanges) {
      setTimetableMap(toClassMap(buildMasterTimetableClasses(config)));
    }
  }, [configTimetableSig, config, hasUnsavedChanges]);

  const classList = useMemo(() => {
    const entries = (Object.values(timetableMap) as TimetableClassEntry[]).map((entry) => {
      const scMatch = resolveClassConfigForLabel(config.classes, entry.label);
      return {
        key: entry.label,
        label: entry.label,
        classTeacher: entry.classTeacher && entry.classTeacher !== 'Unassigned' ? entry.classTeacher : '',
        subjects: scMatch?.subjects || lookupClassSubjectsSeed(entry.label),
      };
    });
    return entries.sort((a, b) => compareClassLabels(a.label, b.label));
  }, [timetableMap, config.classes]);

  const filteredClasses = useMemo(() => {
    if (!classFilter.trim()) return classList;
    const q = classFilter.toLowerCase();
    return classList.filter(
      (c) => c.label.toLowerCase().includes(q) || c.classTeacher.toLowerCase().includes(q)
    );
  }, [classList, classFilter]);

  const [selectedClassLabel, setSelectedClassLabel] = useState<string>(
    () => classList.find((c) => c.label === 'IV-A')?.label || classList[0]?.label || 'IV-A'
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');

  const sheetSync = useTimetableSheetSync();
  const [pushPreview, setPushPreview] = useState<TimetablePushResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const timetableClasses = useMemo(() => Object.values(timetableMap), [timetableMap]);
  const setLocalClasses = sheetSync.setLocalClasses;
  useEffect(() => {
    setLocalClasses(timetableClasses);
  }, [timetableClasses, setLocalClasses]);

  const [loadedSheetSignature, setLoadedSheetSignature] = useState<string | null>(null);
  const currentSheetSignature = useMemo(() => timetableSheetSignature(sheetSync.snapshot), [sheetSync.snapshot]);

  useEffect(() => {
    if (!sheetSync.snapshot || !currentSheetSignature) return;
    if (currentSheetSignature === loadedSheetSignature) return;
    if (hasUnsavedChanges) return;
    const merged = mergeSheetOverLocal(timetableClasses, sheetSync.snapshot);
    if (merged) setTimetableMap(toClassMap(merged.classes));
    setLoadedSheetSignature(currentSheetSignature);
  }, [currentSheetSignature, hasUnsavedChanges, timetableClasses, sheetSync.snapshot]);

  const sheetChangedUnderEdits =
    hasUnsavedChanges && loadedSheetSignature !== null && currentSheetSignature !== '' && currentSheetSignature !== loadedSheetSignature;

  const lastSyncedLabel = useMemo(() => {
    if (!sheetSync.lastSyncedAt) return 'not synced yet';
    const at = new Date(sheetSync.lastSyncedAt);
    return `last synced ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [sheetSync.lastSyncedAt]);

  const cellModal = useTimetableCellModal(
    timetableMap,
    setTimetableMap,
    teachers,
    selectedClassLabel,
    setHasUnsavedChanges
  );

  const activeBellPeriods = useMemo(() => {
    const bells = extractTeachingPeriods(config.periods);
    return bells.length > 0 ? bells : DEFAULT_BASE_PERIODS;
  }, [config.periods]);

  const currentEntry = timetableMap[selectedClassLabel] || {
    label: selectedClassLabel,
    classTeacher: 'Unassigned',
    periods: activeBellPeriods.map((p) => ({
      ...p,
      mon: '—',
      tue: '—',
      wed: '—',
      thu: '—',
      fri: '—',
      sat: '—',
    })),
  };

  const selectedClassInfo = classList.find((c) => c.label === selectedClassLabel);
  const auditReport = useMemo(() => auditFullTimetable(timetableMap, teachers), [timetableMap, teachers]);

  const teacherSchedule = useMemo(() => {
    if (!selectedTeacherId) return null;
    return buildTeacherMasterSchedule(selectedTeacherId, timetableMap, teachers);
  }, [selectedTeacherId, timetableMap, teachers]);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setExportNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setExportNotice(null);
    }, 4000);
  };

  const handleSaveToCloud = () => {
    onUpdateCustomTimetable(Object.values(timetableMap));
    setHasUnsavedChanges(false);
    showNotice('Timetable changes saved.');
  };

  const executeRefreshFromSheet = async () => {
    setSyncing(true);
    const snapshot = await sheetSync.refreshNow().finally(() => setSyncing(false));
    if (!snapshot) {
      showNotice('Could not read the Google Sheet. Check your connection and try again.');
      return;
    }
    const merged = mergeSheetOverLocal(timetableClasses, snapshot);
    if (merged) setTimetableMap(toClassMap(merged.classes));
    setLoadedSheetSignature(timetableSheetSignature(snapshot));
    setHasUnsavedChanges(false);
    setPushPreview(null);
    showNotice('Timetable updated from Google Sheet.');
  };

  const handleSyncToSheet = async () => {
    setSyncing(true);
    const preview = await sheetSync.previewPush(timetableClasses).finally(() => setSyncing(false));
    if (preview.needsReconnect) return;
    if (preview.cellCount === 0) {
      setPushPreview(null);
      showNotice(preview.message);
      return;
    }
    setPushPreview(preview);
  };

  const handleConfirmPushToSheet = async () => {
    setSyncing(true);
    const result = await sheetSync.pushToSheet(timetableClasses).finally(() => setSyncing(false));
    setPushPreview(null);
    if (result.needsReconnect) return;
    if (result.ok && result.snapshot) {
      setLoadedSheetSignature(timetableSheetSignature(result.snapshot));
    }
    showNotice(result.message);
  };

  const handleReconnectSheets = async () => {
    setReconnecting(true);
    try {
      await googleSignIn();
    } finally {
      setReconnecting(false);
    }
  };

  return {
    viewMode,
    setViewMode,
    classFilter,
    setClassFilter,
    exportNotice,
    setExportNotice,
    exportMenuOpen,
    setExportMenuOpen,
    exportMenuRef,
    classList,
    filteredClasses,
    selectedClassLabel,
    setSelectedClassLabel,
    selectedTeacherId,
    setSelectedTeacherId,
    timetableMap,
    setTimetableMap,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    sheetSync,
    pushPreview,
    setPushPreview,
    syncing,
    reconnecting,
    sheetChangedUnderEdits,
    lastSyncedLabel,
    ...cellModal,
    currentEntry,
    selectedClassInfo,
    auditReport,
    teacherSchedule,
    showNotice,
    handleSaveToCloud,
    executeRefreshFromSheet,
    handleSyncToSheet,
    handleConfirmPushToSheet,
    handleReconnectSheets,
  };
}

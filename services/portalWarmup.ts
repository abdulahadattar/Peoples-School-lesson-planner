import type { View } from '../types';

export type KeepAliveSlot =
  | 'home'
  | 'lesson'
  | 'exams'
  | 'history'
  | 'attendance'
  | 'records'
  | 'marksheets'
  | 'archive'
  | 'live'
  | 'settings';

export type WarmupDataKey =
  | 'sheetData'
  | 'marksheetLogos'
  | 'savedPlans'
  | 'savedPapers'
  | 'timetable'
  | 'classEnrollments'
  | 'dossiers'
  | 'documentsSnapshot';

export const VIEW_TO_KEEP_ALIVE_SLOT: Partial<Record<View, KeepAliveSlot>> = {
  home: 'home',
  lesson: 'lesson',
  paper: 'exams',
  'omr-scanner': 'exams',
  history: 'history',
  attendance: 'attendance',
  records: 'records',
  marksheets: 'marksheets',
  archive: 'archive',
  live: 'live',
  settings: 'settings',
};

const PREDICTIVE_NEIGHBORS: Partial<Record<View, View[]>> = {
  home: ['lesson', 'paper', 'attendance', 'records', 'marksheets', 'history', 'archive', 'live', 'settings'],
  lesson: ['history', 'paper', 'home', 'live'],
  paper: ['omr-scanner', 'history', 'marksheets', 'lesson'],
  'omr-scanner': ['paper', 'marksheets', 'history', 'records'],
  records: ['marksheets', 'archive', 'attendance', 'home'],
  marksheets: ['records', 'omr-scanner', 'archive', 'attendance'],
  archive: ['records', 'marksheets', 'attendance'],
  attendance: ['records', 'live', 'marksheets', 'settings'],
  live: ['attendance', 'settings', 'lesson'],
  history: ['lesson', 'paper', 'omr-scanner'],
  settings: ['live', 'attendance', 'records', 'marksheets'],
  results: ['lesson', 'paper', 'omr-scanner', 'history'],
};

const VIEW_DATA_REQUIREMENTS: Partial<Record<View, WarmupDataKey[]>> = {
  home: ['sheetData', 'savedPlans', 'savedPapers', 'marksheetLogos', 'timetable', 'classEnrollments'],
  lesson: ['savedPlans'],
  paper: ['savedPapers'],
  'omr-scanner': ['sheetData', 'savedPapers'],
  history: ['savedPlans', 'savedPapers'],
  attendance: ['classEnrollments', 'sheetData'],
  records: ['sheetData', 'dossiers'],
  marksheets: ['sheetData', 'marksheetLogos'],
  archive: ['sheetData', 'dossiers', 'documentsSnapshot'],
  live: ['timetable'],
  settings: ['timetable', 'classEnrollments'],
};

const DEFAULT_VIEW_WARMUP_ORDER: View[] = [
  'lesson',
  'paper',
  'attendance',
  'records',
  'marksheets',
  'history',
  'archive',
  'live',
  'omr-scanner',
  'settings',
];

const DEFAULT_DATA_WARMUP_ORDER: WarmupDataKey[] = [
  'sheetData',
  'marksheetLogos',
  'savedPlans',
  'savedPapers',
  'timetable',
  'classEnrollments',
  'dossiers',
  'documentsSnapshot',
];

export function getKeepAliveSlot(view: View): KeepAliveSlot | null {
  return VIEW_TO_KEEP_ALIVE_SLOT[view] ?? null;
}

/**
 * Appends a view's keep-alive slot the first time it is visited, preserving
 * mount order so sibling kept-alive DOM subtrees are never reordered or remounted.
 */
export function trackVisitedViewSlots(
  prevSlots: readonly KeepAliveSlot[],
  currentView: View
): KeepAliveSlot[] {
  const slot = getKeepAliveSlot(currentView);
  if (!slot || prevSlots.includes(slot)) {
    return prevSlots as KeepAliveSlot[];
  }
  return [...prevSlots, slot];
}

export function getDataKeysForView(view: View): WarmupDataKey[] {
  return VIEW_DATA_REQUIREMENTS[view] || [];
}

export function getPredictiveWarmupPlan(currentView: View): {
  views: View[];
  dataKeys: WarmupDataKey[];
} {
  const orderedViews: View[] = [];
  const pushView = (v: View) => {
    if (v === 'home' || v === 'results') return;
    if (!orderedViews.includes(v)) orderedViews.push(v);
  };

  for (const neighbor of PREDICTIVE_NEIGHBORS[currentView] || []) {
    pushView(neighbor);
  }
  for (const fallbackView of DEFAULT_VIEW_WARMUP_ORDER) {
    pushView(fallbackView);
  }

  const orderedDataKeys: WarmupDataKey[] = [];
  const pushDataKey = (k: WarmupDataKey) => {
    if (!orderedDataKeys.includes(k)) orderedDataKeys.push(k);
  };

  for (const key of getDataKeysForView(currentView)) {
    pushDataKey(key);
  }
  for (const v of orderedViews) {
    for (const key of getDataKeysForView(v)) {
      pushDataKey(key);
    }
  }
  for (const key of DEFAULT_DATA_WARMUP_ORDER) {
    pushDataKey(key);
  }

  return { views: orderedViews, dataKeys: orderedDataKeys };
}

const warmedDataKeys = new Set<WarmupDataKey>();
const inFlightDataWarmups = new Map<WarmupDataKey, Promise<void>>();

export function resetWarmupStateForTesting(): void {
  warmedDataKeys.clear();
  inFlightDataWarmups.clear();
}

export function runWarmupDataTask(
  key: WarmupDataKey,
  loader: () => Promise<unknown>
): Promise<void> {
  if (warmedDataKeys.has(key)) {
    return Promise.resolve();
  }
  const existing = inFlightDataWarmups.get(key);
  if (existing) {
    return existing;
  }

  const promise = Promise.resolve()
    .then(loader)
    .then(() => {
      warmedDataKeys.add(key);
    })
    .catch(() => {
      // Background warmup must never surface network/offline rejections.
    })
    .finally(() => {
      inFlightDataWarmups.delete(key);
    });

  inFlightDataWarmups.set(key, promise);
  return promise;
}

const defaultDataLoaders: Record<WarmupDataKey, () => Promise<unknown>> = {
  sheetData: async () => {
    const { fetchSheetData } = await import('./sheets/fetcher');
    return fetchSheetData();
  },
  marksheetLogos: async () => {
    const { fetchMarksheetLogoAssets } = await import('./marksheet/logoAssets');
    return fetchMarksheetLogoAssets();
  },
  savedPlans: async () => {
    const { getSavedPlans } = await import('./storageService');
    return getSavedPlans();
  },
  savedPapers: async () => {
    const { getSavedPapers } = await import('./storageService');
    return getSavedPapers();
  },
  timetable: async () => {
    const { loadTimetable } = await import('./timetable/resolver');
    return loadTimetable();
  },
  classEnrollments: async () => {
    const { loadClassEnrollments } = await import('./attendance/repository');
    return loadClassEnrollments();
  },
  dossiers: async () => {
    const { fetchAllDossiers } = await import('./documentClient/clientQueries');
    return fetchAllDossiers();
  },
  documentsSnapshot: async () => {
    const { fetchDocumentsSnapshot } = await import('./documentClient/clientQueries');
    return fetchDocumentsSnapshot();
  },
};

export function warmDataForView(view: View): void {
  if (typeof window === 'undefined') return;
  for (const key of getDataKeysForView(view)) {
    void runWarmupDataTask(key, defaultDataLoaders[key]);
  }
}

export function scheduleBackgroundPortalWarmup(params: {
  currentView: View;
  prefetchChunk: (view: View) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};
  let cancelled = false;
  let stepTimer: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;

  const { views, dataKeys } = getPredictiveWarmupPlan(params.currentView);

  const startWarmup = () => {
    if (cancelled) return;
    let chunkIdx = 0;
    let dataIdx = 0;

    const runNextStep = () => {
      if (cancelled) return;
      if (chunkIdx < views.length) {
        params.prefetchChunk(views[chunkIdx++]);
        stepTimer = setTimeout(runNextStep, 70);
        return;
      }
      if (dataIdx < dataKeys.length) {
        const key = dataKeys[dataIdx++];
        void runWarmupDataTask(key, defaultDataLoaders[key]);
        stepTimer = setTimeout(runNextStep, 110);
      }
    };

    runNextStep();
  };

  if ('requestIdleCallback' in window) {
    idleId = (
      window as Window & {
        requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback(startWarmup, { timeout: 1400 });
  } else {
    stepTimer = setTimeout(startWarmup, 450);
  }

  return () => {
    cancelled = true;
    if (stepTimer !== null) clearTimeout(stepTimer);
    if (idleId !== null && 'cancelIdleCallback' in window) {
      (
        window as Window & { cancelIdleCallback: (id: number) => void }
      ).cancelIdleCallback(idleId);
    }
  };
}

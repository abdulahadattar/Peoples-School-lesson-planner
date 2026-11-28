import type { View } from '../types';

export type PortalPublicPage = 'privacy' | 'terms';

export interface PortalHistoryState {
  portalView: View;
  paperSubView?: 'create' | 'scan';
  lessonSubView?: 'create' | 'saved';
}

export type ResolvedPortalRoute =
  | {
      kind: 'public';
      page: PortalPublicPage;
      canonicalPath: '/privacy' | '/terms';
    }
  | {
      kind: 'portal';
      view: View;
      canonicalPath: string;
      paperSubView?: 'create' | 'scan';
      wasAlias: boolean;
      wasFallback: boolean;
    };

export const VIEW_PATHS: Record<View, string> = {
  home: '/',
  lesson: '/lesson-plans',
  paper: '/exams',
  'omr-scanner': '/omr-scanner',
  history: '/history',
  attendance: '/attendance',
  records: '/students',
  marksheets: '/marksheets',
  archive: '/documents',
  live: '/live-monitor',
  settings: '/admin',
  results: '/results',
};

const PATH_TO_VIEW: Record<string, { view: View; paperSubView?: 'create' | 'scan' }> = {
  '/': { view: 'home' },
  '/dashboard': { view: 'home' },
  '/home': { view: 'home' },
  '/lesson-plans': { view: 'lesson' },
  '/lessons': { view: 'lesson' },
  '/lesson': { view: 'lesson' },
  '/exams': { view: 'paper', paperSubView: 'create' },
  '/papers': { view: 'paper', paperSubView: 'create' },
  '/paper': { view: 'paper', paperSubView: 'create' },
  '/omr-scanner': { view: 'omr-scanner', paperSubView: 'scan' },
  '/exams/scanner': { view: 'omr-scanner', paperSubView: 'scan' },
  '/exams/omr': { view: 'omr-scanner', paperSubView: 'scan' },
  '/history': { view: 'history' },
  '/attendance': { view: 'attendance' },
  '/daily-attendance': { view: 'attendance' },
  '/students': { view: 'records' },
  '/records': { view: 'records' },
  '/student-records': { view: 'records' },
  '/marksheets': { view: 'marksheets' },
  '/documents': { view: 'archive' },
  '/archive': { view: 'archive' },
  '/student-documents': { view: 'archive' },
  '/live-monitor': { view: 'live' },
  '/live': { view: 'live' },
  '/admin': { view: 'settings' },
  '/settings': { view: 'settings' },
  '/school-admin': { view: 'settings' },
  '/results': { view: 'results' },
};

export const PROTECTED_PORTAL_VIEWS: ReadonlySet<View> = new Set<View>([
  'records',
  'archive',
  'attendance',
  'marksheets',
  'settings',
]);

export function normalizePortalPath(pathname: string): string {
  const raw = String(pathname || '').trim();
  if (!raw) return '/';
  const collapsed = raw.replace(/\/{2,}/g, '/');
  const withoutTrailing = collapsed.replace(/\/+$/, '');
  if (!withoutTrailing) return '/';
  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
}

export function getPathForView(view: View): string {
  return VIEW_PATHS[view] || '/';
}

export function isProtectedPortalView(view: View): boolean {
  return PROTECTED_PORTAL_VIEWS.has(view);
}

export function resolvePortalRoute(pathname: string): ResolvedPortalRoute {
  const normalized = normalizePortalPath(pathname);
  const lower = normalized.toLowerCase();

  if (lower === '/privacy') {
    return { kind: 'public', page: 'privacy', canonicalPath: '/privacy' };
  }
  if (lower === '/terms') {
    return { kind: 'public', page: 'terms', canonicalPath: '/terms' };
  }

  const matched = PATH_TO_VIEW[lower];
  if (matched) {
    const canonicalPath = getPathForView(matched.view);
    return {
      kind: 'portal',
      view: matched.view,
      canonicalPath,
      paperSubView: matched.paperSubView,
      wasAlias: normalized !== canonicalPath,
      wasFallback: false,
    };
  }

  return {
    kind: 'portal',
    view: 'home',
    canonicalPath: '/',
    wasAlias: false,
    wasFallback: normalized !== '/',
  };
}

export function buildPortalHistoryState(
  view: View,
  options?: { paperSubView?: 'create' | 'scan'; lessonSubView?: 'create' | 'saved' }
): PortalHistoryState {
  const state: PortalHistoryState = { portalView: view };
  if (options?.paperSubView) {
    state.paperSubView = options.paperSubView;
  } else if (view === 'omr-scanner') {
    state.paperSubView = 'scan';
  }
  if (options?.lessonSubView) {
    state.lessonSubView = options.lessonSubView;
  }
  return state;
}

export function shouldPushPortalHistory(
  currentPath: string,
  targetPath: string,
  currentState?: unknown,
  targetView?: View
): boolean {
  const normCurrent = normalizePortalPath(currentPath).toLowerCase();
  const normTarget = normalizePortalPath(targetPath).toLowerCase();
  if (normCurrent !== normTarget) return true;

  if (targetView && currentState && typeof currentState === 'object') {
    const stateView = (currentState as Partial<PortalHistoryState>).portalView;
    if (stateView && stateView !== targetView) return true;
  }
  return false;
}

export function extractRouteFromPopState(
  pathname: string,
  state: unknown
): {
  kind: 'public';
  page: PortalPublicPage;
  canonicalPath: '/privacy' | '/terms';
} | {
  kind: 'portal';
  view: View;
  canonicalPath: string;
  paperSubView?: 'create' | 'scan';
  lessonSubView?: 'create' | 'saved';
} {
  const resolved = resolvePortalRoute(pathname);
  if (resolved.kind === 'public') {
    return resolved;
  }

  const historyState = state && typeof state === 'object' ? (state as Partial<PortalHistoryState>) : undefined;
  const paperSubView =
    resolved.view === 'omr-scanner'
      ? 'scan'
      : historyState?.paperSubView || resolved.paperSubView;

  return {
    kind: 'portal',
    view: resolved.view,
    canonicalPath: resolved.canonicalPath,
    paperSubView,
    lessonSubView: historyState?.lessonSubView,
  };
}

export function shouldRequireLoginGateOnRoute(params: {
  authResolved: boolean;
  hasUser: boolean;
  isGuestMode: boolean;
  view: View;
}): boolean {
  if (!params.authResolved) return false;
  if (params.hasUser) return false;
  if (!params.isGuestMode) return true;
  return false;
}

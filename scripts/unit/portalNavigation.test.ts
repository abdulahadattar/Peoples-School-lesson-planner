import {
  VIEW_PATHS,
  normalizePortalPath,
  getPathForView,
  isProtectedPortalView,
  resolvePortalRoute,
  buildPortalHistoryState,
  shouldPushPortalHistory,
  extractRouteFromPopState,
  shouldRequireLoginGateOnRoute,
} from '../../services/portalNavigation';
import type { View } from '../../types';

export function runPortalNavigationTests(t: {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
}) {
  const { describe, it, eq } = t;

  describe('portalNavigation.normalizePortalPath');
  it('normalizes empty, trailing slashes, duplicate slashes, and missing leading slash', () => {
    eq(normalizePortalPath(''), '/');
    eq(normalizePortalPath('/'), '/');
    eq(normalizePortalPath('/exams/'), '/exams');
    eq(normalizePortalPath('marksheets///'), '/marksheets');
    eq(normalizePortalPath('//lesson-plans//'), '/lesson-plans');
  });

  describe('portalNavigation.resolvePortalRoute');
  it('resolves standalone public routes before auth', () => {
    eq(resolvePortalRoute('/privacy'), {
      kind: 'public',
      page: 'privacy',
      canonicalPath: '/privacy',
    });
    eq(resolvePortalRoute('/terms/'), {
      kind: 'public',
      page: 'terms',
      canonicalPath: '/terms',
    });
    eq(resolvePortalRoute('/PRIVACY'), {
      kind: 'public',
      page: 'privacy',
      canonicalPath: '/privacy',
    });
  });

  it('maps every canonical portal view path cleanly and round-trips', () => {
    const views = Object.keys(VIEW_PATHS) as View[];
    for (const view of views) {
      const path = getPathForView(view);
      const resolved = resolvePortalRoute(path);
      eq(resolved.kind, 'portal', `expected portal route for ${view}`);
      if (resolved.kind === 'portal') {
        eq(resolved.view, view, `round-trip failed for ${path}`);
        eq(resolved.canonicalPath, path);
        eq(resolved.wasFallback, false);
      }
    }
  });

  it('resolves readable aliases to their canonical portal views', () => {
    const dashboard = resolvePortalRoute('/dashboard');
    eq(dashboard.kind, 'portal');
    if (dashboard.kind === 'portal') {
      eq(dashboard.view, 'home');
      eq(dashboard.canonicalPath, '/');
      eq(dashboard.wasAlias, true);
      eq(dashboard.wasFallback, false);
    }

    const scanner = resolvePortalRoute('/exams/scanner');
    eq(scanner.kind, 'portal');
    if (scanner.kind === 'portal') {
      eq(scanner.view, 'omr-scanner');
      eq(scanner.canonicalPath, '/omr-scanner');
      eq(scanner.paperSubView, 'scan');
      eq(scanner.wasAlias, true);
    }

    const legacyAdmin = resolvePortalRoute('/settings');
    eq(legacyAdmin.kind, 'portal');
    if (legacyAdmin.kind === 'portal') {
      eq(legacyAdmin.view, 'settings');
      eq(legacyAdmin.canonicalPath, '/admin');
    }
  });

  it('falls back safely to home for unknown paths without throwing or returning blank', () => {
    const unknown = resolvePortalRoute('/some-unknown-route/123');
    eq(unknown, {
      kind: 'portal',
      view: 'home',
      canonicalPath: '/',
      wasAlias: false,
      wasFallback: true,
    });
  });

  describe('portalNavigation.shouldPushPortalHistory');
  it('avoids duplicate history entries when already on the same view and path', () => {
    eq(shouldPushPortalHistory('/exams', '/exams', { portalView: 'paper' }, 'paper'), false);
    eq(shouldPushPortalHistory('/exams/', '/exams', { portalView: 'paper' }, 'paper'), false);
    eq(shouldPushPortalHistory('/', '/', { portalView: 'home' }, 'home'), false);
  });

  it('pushes a history entry when switching to a different path or view', () => {
    eq(shouldPushPortalHistory('/', '/exams', { portalView: 'home' }, 'paper'), true);
    eq(shouldPushPortalHistory('/exams', '/marksheets', { portalView: 'paper' }, 'marksheets'), true);
    eq(shouldPushPortalHistory('/exams', '/omr-scanner', { portalView: 'paper' }, 'omr-scanner'), true);
  });

  describe('portalNavigation.extractRouteFromPopState');
  it('restores portal view and sub-view state from popstate', () => {
    const popped = extractRouteFromPopState('/lesson-plans', {
      portalView: 'lesson',
      lessonSubView: 'saved',
    });
    eq(popped, {
      kind: 'portal',
      view: 'lesson',
      canonicalPath: '/lesson-plans',
      paperSubView: undefined,
      lessonSubView: 'saved',
    });

    const poppedScanner = extractRouteFromPopState('/omr-scanner', buildPortalHistoryState('omr-scanner'));
    eq(poppedScanner, {
      kind: 'portal',
      view: 'omr-scanner',
      canonicalPath: '/omr-scanner',
      paperSubView: 'scan',
      lessonSubView: undefined,
    });
  });

  describe('portalNavigation.shouldRequireLoginGateOnRoute');
  it('re-checks auth access cleanly for protected and portal views', () => {
    eq(isProtectedPortalView('settings'), true);
    eq(isProtectedPortalView('marksheets'), true);
    eq(isProtectedPortalView('records'), true);
    eq(isProtectedPortalView('home'), false);

    // Wait for auth resolution before gating
    eq(
      shouldRequireLoginGateOnRoute({
        authResolved: false,
        hasUser: false,
        isGuestMode: false,
        view: 'marksheets',
      }),
      false
    );

    // Signed out & not guest -> gate required on protected views
    eq(
      shouldRequireLoginGateOnRoute({
        authResolved: true,
        hasUser: false,
        isGuestMode: false,
        view: 'marksheets',
      }),
      true
    );

    // Signed in -> no gate
    eq(
      shouldRequireLoginGateOnRoute({
        authResolved: true,
        hasUser: true,
        isGuestMode: false,
        view: 'settings',
      }),
      false
    );

    // Guest mode -> read-only browsing allowed without blocking overlay
    eq(
      shouldRequireLoginGateOnRoute({
        authResolved: true,
        hasUser: false,
        isGuestMode: true,
        view: 'settings',
      }),
      false
    );
  });
}

import { useState, useEffect, useCallback, useRef } from 'react';
import type { View } from '../types';
import {
  buildPortalHistoryState,
  extractRouteFromPopState,
  getPathForView,
  normalizePortalPath,
  resolvePortalRoute,
  shouldPushPortalHistory,
  type ResolvedPortalRoute,
} from '../services/portalNavigation';

export interface UsePortalHistoryOptions {
  onPopPortalView?: (resolved: {
    view: View;
    paperSubView?: 'create' | 'scan';
    lessonSubView?: 'create' | 'saved';
  }) => void;
}

export function usePortalHistory(options?: UsePortalHistoryOptions) {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizePortalPath(window.location.pathname) : '/'
  );

  const initialRoute = resolvePortalRoute(pathname);
  const [view, setView] = useState<View>(() =>
    initialRoute.kind === 'portal' ? initialRoute.view : 'home'
  );

  const onPopPortalViewRef = useRef(options?.onPopPortalView);
  onPopPortalViewRef.current = options?.onPopPortalView;

  // Canonicalize initial alias/fallback URLs and stamp initial history.state without adding entries.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentNormalized = normalizePortalPath(window.location.pathname);
    const resolved = resolvePortalRoute(currentNormalized);

    if (resolved.kind === 'public') {
      if (currentNormalized !== resolved.canonicalPath) {
        window.history.replaceState(null, '', resolved.canonicalPath + window.location.search + window.location.hash);
        setPathname(resolved.canonicalPath);
      }
      return;
    }

    const nextState = buildPortalHistoryState(resolved.view, {
      paperSubView: resolved.paperSubView,
    });
    const currentStateView =
      window.history.state && typeof window.history.state === 'object'
        ? (window.history.state as { portalView?: View }).portalView
        : undefined;

    if (resolved.wasAlias || resolved.wasFallback) {
      window.history.replaceState(
        nextState,
        '',
        resolved.canonicalPath + window.location.search + window.location.hash
      );
      setPathname(resolved.canonicalPath);
      setView(resolved.view);
    } else if (currentStateView !== resolved.view) {
      window.history.replaceState(
        nextState,
        '',
        window.location.pathname + window.location.search + window.location.hash
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      const nextRawPath = normalizePortalPath(window.location.pathname);
      const extracted = extractRouteFromPopState(nextRawPath, event.state);
      setPathname(extracted.canonicalPath);

      if (extracted.kind === 'portal') {
        setView(extracted.view);
        onPopPortalViewRef.current?.({
          view: extracted.view,
          paperSubView: extracted.paperSubView,
          lessonSubView: extracted.lessonSubView,
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToView = useCallback(
    (
      targetView: View,
      navOptions?: {
        paperSubView?: 'create' | 'scan';
        lessonSubView?: 'create' | 'saved';
        replace?: boolean;
      }
    ) => {
      const targetPath = getPathForView(targetView);
      const nextState = buildPortalHistoryState(targetView, navOptions);

      if (typeof window !== 'undefined') {
        if (navOptions?.replace) {
          window.history.replaceState(nextState, '', targetPath);
        } else if (
          shouldPushPortalHistory(
            window.location.pathname,
            targetPath,
            window.history.state,
            targetView
          )
        ) {
          window.history.pushState(nextState, '', targetPath);
        }
      }

      setPathname(targetPath);
      setView(targetView);
    },
    []
  );

  const navigateToPath = useCallback((targetPath: string) => {
    const resolved: ResolvedPortalRoute = resolvePortalRoute(targetPath);
    const canonical = resolved.canonicalPath;

    if (typeof window !== 'undefined') {
      const state =
        resolved.kind === 'portal'
          ? buildPortalHistoryState(resolved.view, { paperSubView: resolved.paperSubView })
          : { publicPage: resolved.page };

      if (
        shouldPushPortalHistory(
          window.location.pathname,
          canonical,
          window.history.state,
          resolved.kind === 'portal' ? resolved.view : undefined
        )
      ) {
        window.history.pushState(state, '', canonical);
      }
    }

    setPathname(canonical);
    if (resolved.kind === 'portal') {
      setView(resolved.view);
    }
  }, []);

  return {
    pathname,
    topRoute: resolvePortalRoute(pathname),
    view,
    setView,
    navigateToView,
    navigateToPath,
  };
}

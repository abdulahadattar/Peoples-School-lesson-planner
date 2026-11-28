import React, { useState, useEffect, useLayoutEffect, useCallback, RefObject } from 'react';

export type DropdownWidthMode = 'match' | 'compact' | 'wide' | 'xl' | string;

const HIDDEN_FIXED_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: -9999,
  left: -9999,
  visibility: 'hidden',
  zIndex: 9999,
};

export function useDropdownPlacement(
  isOpen: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  dropdownWidth: DropdownWidthMode = 'wide',
) {
  // Always keep position: fixed from frame 0 so portaling into document.body
  // never inserts a static block element that triggers a root scrollbar flash.
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>(HIDDEN_FIXED_STYLE);

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 8;
    const gap = 6;

    let targetWidth = rect.width;
    if (dropdownWidth === 'compact') {
      targetWidth = Math.min(Math.max(rect.width, 190), 260);
    } else if (dropdownWidth === 'wide') {
      targetWidth = Math.min(Math.max(rect.width, 300), 420);
    } else if (dropdownWidth === 'xl') {
      targetWidth = Math.min(Math.max(rect.width, 360), 500);
    }
    const maxAllowedWidth = Math.max(120, viewportWidth - margin * 2);
    const width = Math.min(targetWidth, maxAllowedWidth);

    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, rect.right - width);
    }
    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - margin - width);
    }
    left = Math.max(margin, left);

    const spaceBelow = viewportHeight - rect.bottom - margin - gap;
    const spaceAbove = rect.top - margin - gap;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(150, Math.min(360, openUpward ? spaceAbove : spaceBelow));

    const nextStyle: React.CSSProperties = {
      position: 'fixed',
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(availableHeight),
      visibility: 'visible',
      zIndex: 9999,
      ...(openUpward
        ? { bottom: Math.round(viewportHeight - rect.top + gap) }
        : { top: Math.round(rect.bottom + gap) }),
    };

    setPortalStyle(nextStyle);
  }, [triggerRef, dropdownWidth]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPortalStyle(HIDDEN_FIXED_STYLE);
      return;
    }
    updatePlacement();
  }, [isOpen, updatePlacement]);

  useEffect(() => {
    if (!isOpen) return;
    let rafId: number | null = null;
    const handleReposition = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePlacement();
      });
    };
    window.addEventListener('resize', handleReposition, { passive: true });
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePlacement]);

  return { portalStyle };
}

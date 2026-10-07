import { useState, useEffect, useMemo, RefObject } from 'react';

export function useDropdownPlacement(
  isOpen: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  dropdownWidth: 'match' | 'wide' | 'xl' | string = 'wide'
) {
  const [alignment, setAlignment] = useState<'left' | 'right' | 'center'>('left');

  useEffect(() => {
    if (!isOpen) return;

    const checkPlacement = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const triggerCenter = rect.left + rect.width / 2;
      const spaceOnRight = viewportWidth - rect.left;
      const spaceOnLeft = rect.right;
      const targetMenuWidth = 380;

      if (spaceOnRight < targetMenuWidth && spaceOnLeft >= targetMenuWidth - 100) {
        setAlignment('right');
      } else if (triggerCenter > viewportWidth * 0.6) {
        setAlignment('right');
      } else if (triggerCenter < viewportWidth * 0.4) {
        setAlignment('left');
      } else if (spaceOnRight < targetMenuWidth && spaceOnLeft < targetMenuWidth) {
        setAlignment('center');
      } else {
        setAlignment('left');
      }
    };

    checkPlacement();
    window.addEventListener('resize', checkPlacement);
    return () => window.removeEventListener('resize', checkPlacement);
  }, [isOpen, triggerRef, dropdownWidth]);

  const dropdownWidthClass = useMemo(() => {
    if (dropdownWidth === 'match') return 'w-full min-w-full left-0 right-0';

    const baseWidth =
      dropdownWidth === 'xl'
        ? 'w-full min-w-full sm:w-[460px] sm:min-w-[380px] sm:max-w-[540px]'
        : dropdownWidth === 'wide'
        ? 'w-full min-w-full sm:w-[380px] sm:min-w-[320px] sm:max-w-[460px]'
        : 'w-full min-w-full sm:w-[360px] sm:max-w-[440px]';

    if (alignment === 'right') {
      return `${baseWidth} right-0 left-auto`;
    }
    if (alignment === 'center') {
      return `${baseWidth} sm:left-1/2 sm:-translate-x-1/2 left-0`;
    }
    return `${baseWidth} left-0 right-auto`;
  }, [dropdownWidth, alignment]);

  return { dropdownWidthClass };
}

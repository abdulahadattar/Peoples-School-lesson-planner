import { useState, useCallback, useEffect, useRef } from 'react';
import { copyToClipboard } from '../utils/clipboard';

/**
 * useClipboardCopy — Reusable hook for copying text to clipboard with ephemeral success state.
 */
export function useClipboardCopy(resetDelayMs = 2500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string, key = 'default'): Promise<boolean> => {
      const success = await copyToClipboard(text);
      if (success) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setCopiedKey(key);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setCopiedKey((curr) => (curr === key ? null : curr));
        }, resetDelayMs);
      }
      return success;
    },
    [resetDelayMs]
  );

  const isCopied = useCallback((key = 'default') => copiedKey === key, [copiedKey]);

  return { copy, copiedKey, isCopied, setCopiedKey };
}


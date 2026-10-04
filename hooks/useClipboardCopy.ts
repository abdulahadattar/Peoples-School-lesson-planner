import { useState, useCallback } from 'react';
import { copyToClipboard } from '../utils/clipboard';

/**
 * useClipboardCopy — Reusable hook for copying text to clipboard with ephemeral success state.
 */
export function useClipboardCopy(resetDelayMs = 2500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, key = 'default'): Promise<boolean> => {
      const success = await copyToClipboard(text);
      if (success) {
        setCopiedKey(key);
        setTimeout(() => {
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


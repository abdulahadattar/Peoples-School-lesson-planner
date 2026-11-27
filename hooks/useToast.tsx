import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Toast, ToastMessage, ToastType } from '../components/ui/Toast';

export function useToast(defaultDurationMs = 4000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs = defaultDurationMs) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({ message, type });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setToast((curr) => (curr?.message === message ? null : curr));
      }, durationMs);
    },
    [defaultDurationMs]
  );

  const closeToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const ToastComponent = toast ? <Toast toast={toast} onClose={closeToast} /> : null;

  return { toast, setToast, showToast, closeToast, ToastComponent };
}

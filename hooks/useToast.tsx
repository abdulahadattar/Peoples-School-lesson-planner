import React, { useState, useCallback } from 'react';
import { Toast, ToastMessage, ToastType } from '../components/ui/Toast';

export function useToast(defaultDurationMs = 4000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs = defaultDurationMs) => {
      setToast({ message, type });
      setTimeout(() => {
        setToast((curr) => (curr?.message === message ? null : curr));
      }, durationMs);
    },
    [defaultDurationMs]
  );

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  const ToastComponent = toast ? <Toast toast={toast} onClose={closeToast} /> : null;

  return { toast, setToast, showToast, closeToast, ToastComponent };
}

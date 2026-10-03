import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id?: string;
  type: ToastType;
  message: string;
}

export interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast) return null;

  const bgStyle = (() => {
    switch (toast.type) {
      case 'success':
        return 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200';
      case 'error':
        return 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200';
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';
      case 'info':
      default:
        return 'bg-blue-50 dark:bg-blue-950/80 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
    }
  })();

  const IconComponent = (() => {
    switch (toast.type) {
      case 'success':
        return CheckCircle2;
      case 'error':
        return AlertCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
      default:
        return Info;
    }
  })();

  return (
    <div className="fixed bottom-8 right-6 z-[200] max-w-sm w-full animate-fadeIn shadow-lg">
      <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${bgStyle} backdrop-blur-md`}>
        <IconComponent className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm font-medium flex-1 leading-snug break-words">
          {toast.message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="p-1 -mr-1 text-current opacity-70 hover:opacity-100 rounded-md transition-opacity cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

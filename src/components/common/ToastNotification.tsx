import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  duration?: number;
}

export function showToast(
  type: 'success' | 'error' | 'info' | 'warning',
  title: string,
  message: string,
  duration = 5000
) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('portus-show-toast', {
      detail: {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        title,
        message,
        duration,
      },
    });
    window.dispatchEvent(event);
  }
}

export const ToastNotificationContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (e: any) => {
      if (e.detail) {
        const newToast: ToastMessage = e.detail;
        setToasts((prev) => [...prev, newToast]);

        const dur = newToast.duration || 5000;
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, dur);
      }
    };

    window.addEventListener('portus-show-toast', handleToast);
    return () => {
      window.removeEventListener('portus-show-toast', handleToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-3">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl p-4 shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
              isSuccess
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/50'
                : isError
                ? 'bg-rose-950/95 border-rose-500/50 text-rose-100 shadow-rose-950/50'
                : isWarning
                ? 'bg-amber-950/95 border-amber-500/50 text-amber-100 shadow-amber-950/50'
                : 'bg-slate-900/95 border-slate-700/60 text-slate-100 shadow-black/50'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {isError && <AlertTriangle className="w-5 h-5 text-rose-400" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-blue-400" />}
            </div>

            <div className="flex-1 min-w-0">
              {toast.title && (
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  {toast.title}
                </h4>
              )}
              <p className="text-xs leading-relaxed text-slate-200 mt-0.5 font-medium">
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

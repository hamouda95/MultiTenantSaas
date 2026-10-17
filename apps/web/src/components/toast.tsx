'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ toast: (kind: ToastKind, message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-lg border bg-surface p-3 text-sm shadow-lg',
              t.kind === 'error' ? 'border-danger/40' : 'border-success/40',
            )}
          >
            {t.kind === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            <p className="flex-1 text-fg">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-fg"
              aria-label="Fermer la notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>');
  return ctx.toast;
}

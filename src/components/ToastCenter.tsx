import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastKind = 'success' | 'info' | 'warn' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastCenterProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const KIND_STYLES: Record<ToastKind, { border: string; icon: typeof Info; iconClass: string }> = {
  success: {
    border: 'border-emerald-400/30 bg-emerald-950/85',
    icon: CheckCircle2,
    iconClass: 'text-emerald-300',
  },
  info: {
    border: 'border-sky-400/30 bg-slate-950/90',
    icon: Info,
    iconClass: 'text-sky-300',
  },
  warn: {
    border: 'border-amber-400/30 bg-amber-950/80',
    icon: AlertTriangle,
    iconClass: 'text-amber-300',
  },
  error: {
    border: 'border-rose-400/30 bg-rose-950/85',
    icon: XCircle,
    iconClass: 'text-rose-300',
  },
};

export function ToastCenter({ toasts, onDismiss }: ToastCenterProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed top-16 right-3 z-[70] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const style = KIND_STYLES[toast.kind];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur-md ${style.border}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">{toast.title}</p>
              {toast.message && (
                <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{toast.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

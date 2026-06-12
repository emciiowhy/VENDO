"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { useTheme } from "./theme/ThemeProvider";

/**
 * App-wide toast notification system for the real-time alert pipeline. Toasts
 * are pushed imperatively (`useToast().push(...)`) from event handlers and live
 * event-stream callbacks — never synchronously inside an effect body — so they
 * sidestep the set-state-in-effect rule. The stack is portaled to <body> at the
 * top toast layer (z-[130], above modals/PIN); the theme class is carried in so
 * dark tokens still resolve outside the originating shell.
 */
export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastInput {
  variant?: ToastVariant;
  title: string;
  message?: string;
  /** ms before auto-dismiss; 0 = sticky until closed. Default 7000. */
  ttl?: number;
}

interface Toast extends Required<Omit<ToastInput, "message">> {
  id: number;
  message?: string;
}

interface ToastApi {
  push: (t: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Imperative toast handle. Safe to call from clicks, timeouts, SSE handlers. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const VARIANT: Record<ToastVariant, { icon: IconName; strip: string; chip: string }> = {
  info: { icon: "activity", strip: "bg-brand-500", chip: "bg-brand-50 text-brand-600" },
  success: { icon: "check", strip: "bg-accent-500", chip: "bg-accent-50 text-accent-600" },
  warning: { icon: "box", strip: "bg-amber-500", chip: "bg-amber-50 text-amber-600" },
  danger: { icon: "shield", strip: "bg-rose-500", chip: "bg-rose-50 text-rose-600" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      const toast: Toast = {
        id,
        variant: t.variant ?? "info",
        title: t.title,
        message: t.message,
        ttl: t.ttl ?? 7000,
      };
      setToasts((prev) => [toast, ...prev].slice(0, 5));
      if (toast.ttl > 0) window.setTimeout(() => remove(id), toast.ttl);
    },
    [remove],
  );

  const canPortal = typeof document !== "undefined";

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {canPortal &&
        createPortal(
          <div className={theme === "dark" ? "dark" : ""}>
            <div className="fixed top-4 right-4 z-[130] flex flex-col gap-2.5 w-[min(360px,calc(100vw-2rem))]">
              {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const v = VARIANT[toast.variant];
  return (
    <div
      role="alert"
      className="toast-in relative overflow-hidden rounded-xl2 bg-surface hairline shadow-soft pl-4 pr-3 py-3.5 flex items-start gap-3"
    >
      <span className={"absolute left-0 inset-y-0 w-1 " + v.strip} />
      <span className={"grid place-items-center w-8 h-8 rounded-[10px] shrink-0 " + v.chip}>
        <Icon name={v.icon} className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold tracking-tight">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-[12.5px] text-ink-soft leading-snug">{toast.message}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 -mr-1 -mt-0.5 p-1 text-ink-faint hover:text-ink transition"
      >
        <Icon name="x" className="w-4 h-4" strokeWidth={1.9} />
      </button>
    </div>
  );
}

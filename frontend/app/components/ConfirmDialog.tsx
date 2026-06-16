"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import { useTheme } from "./theme/ThemeProvider";

/**
 * A small, reusable confirmation modal (portaled to <body> with the theme class
 * carried in so dark tokens resolve outside the shell). Used to guard logout /
 * lock actions and any other "are you sure?" moment. Esc or backdrop cancels.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  icon = "logout",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconName;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    // Portal lands on <body>, outside .theme-root — without `text-ink` the title
    // (and any token-less text) inherits body's light-mode ink and goes dark-on-dark
    // on the dark surface. Mirrors the PinSwitcher portal. The `.dark` class retints
    // the token so the same `text-ink` reads correctly in both modes.
    <div className={"text-ink " + (theme === "dark" ? "dark" : "")}>
      <div className="fixed inset-0 z-[125] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
        <div className="relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card">
          <div
            className={
              "grid place-items-center w-11 h-11 rounded-[12px] " +
              (danger ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600")
            }
          >
            <Icon name={icon} className="w-5 h-5" strokeWidth={1.8} />
          </div>
          <h3 className="mt-4 text-[1.1rem] font-extrabold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed">{message}</p>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={
                "text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 " +
                (danger ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-500 hover:bg-brand-600")
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

/**
 * Shared primitives for the Account hub cards so every section reads the same:
 * a titled surface card, labelled text/area inputs, and a pill toggle. Kept
 * local to the account module — these match the SecurityCard styling exactly.
 */

export function SectionCard({
  icon,
  title,
  description,
  children,
  footer,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
          <Icon name={icon} className="w-5 h-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[1.05rem] font-extrabold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[13.5px] text-ink-soft leading-relaxed max-w-[60ch]">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">{children}</div>
      {footer && <div className="mt-5">{footer}</div>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {error ? (
        <span className="mt-1 block text-[12px] font-semibold text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5 resize-y"
      />
      {hint && <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>}
    </label>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left py-2"
    >
      <span
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition duration-150 " +
          (checked ? "bg-brand-500" : "bg-ink-faint/30")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-150 " +
            (checked ? "translate-x-[22px]" : "translate-x-0.5")
          }
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
        {description && <span className="block text-[12.5px] text-ink-soft">{description}</span>}
      </span>
    </button>
  );
}

export function PrimaryButton({
  children,
  busy,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className="rounded-[10px] bg-brand-500 hover:bg-brand-600 px-5 py-2.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? "Saving…" : children}
    </button>
  );
}

/** Skeleton block for a card that's still loading its data. */
export function CardSkeleton() {
  return <div className="h-[280px] rounded-xl2 bg-surface hairline shadow-card animate-pulse" />;
}

const METHOD_LABELS: Record<string, string> = {
  google: "Google sign-in",
  password: "Password sign-in",
  pin: "Cashier PIN",
  impersonate: "Admin access",
};

/** Human label for a session/login method code. */
export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

/** Coarse "Browser · OS" summary from a user-agent string (no library). */
export function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /OPR|Opera/.test(ua)
      ? "Opera"
      : /Chrome/.test(ua)
        ? "Chrome"
        : /Firefox/.test(ua)
          ? "Firefox"
          : /Safari/.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "device";
  return `${browser} · ${os}`;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

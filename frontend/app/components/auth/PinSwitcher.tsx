"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { PinPad } from "./PinPad";
import { ForgotPin } from "./ForgotPin";
import { useTheme } from "../theme/ThemeProvider";
import { switchByPin } from "@/lib/auth";
import { listCashiers, type CashierProfile } from "@/lib/pos";
import { formatCents } from "@/lib/format";

/**
 * The shared-terminal cashier switch (WARM terminal — a manager/owner is signed
 * in via Google, so an active Tenant session scopes everything).
 *
 * Two-step flow over a blurred full-screen scrim:
 *   1. Pick your operator profile (loaded from /api/v1/pos/cashiers).
 *   2. Enter your 4-digit PIN — verified against the selected cashier so a
 *      colliding PIN can't switch into the wrong person.
 * (The cold login screen uses {@link StoreSignIn} instead.)
 */
export function PinSwitcher({
  triggerLabel = "Cashier? Enter your PIN",
  triggerClassName = "inline-flex items-center justify-center gap-2 w-full bg-surface hairline text-ink font-semibold text-[14.5px] py-3 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150",
  openShift = null,
  onCloseShift,
  autoOpen = false,
  hideTrigger = false,
  onClose,
  selectTitle = "Switch cashier",
  selectSubtitle = "Choose your profile to take the till.",
}: {
  triggerLabel?: string;
  triggerClassName?: string;
  /**
   * The CURRENT operator's open shift, if any. When set, switching cashiers
   * first warns that the drawer is still open — handing the till to someone else
   * without a Z-Read leaves an unreconciled shift. Null when the operator has no
   * open shift (e.g. an owner/manager off-till), which skips the warning.
   */
  openShift?: { expectedCashCents: number } | null;
  /** Jump the operator into the End-shift (Z-Read) flow from the warning. */
  onCloseShift?: () => void;
  /** Open immediately on mount (e.g. the "who's next?" prompt after a Z-Read). */
  autoOpen?: boolean;
  /** Render no trigger button — for a purely parent-controlled instance. */
  hideTrigger?: boolean;
  /** Notified when the switcher is dismissed (so a parent can unmount it). */
  onClose?: () => void;
  /** Heading copy for the profile-select step (e.g. "Who's on duty?"). */
  selectTitle?: string;
  selectSubtitle?: string;
} = {}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(autoOpen);
  const [step, setStep] = useState<"shiftWarn" | "select" | "pin">("select");
  const [cashiers, setCashiers] = useState<CashierProfile[]>([]);
  const [loadingList, setLoadingList] = useState(autoOpen);
  const [selected, setSelected] = useState<CashierProfile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setStep("select");
    setSelected(null);
    setPin("");
    setError(null);
    setSubmitting(false);
    setForgot(false);
    onClose?.();
  }, [onClose]);

  // Auto-opened (next-cashier) instance: load profiles on mount. No setState
  // before the await keeps this off the cascading-render path the lint guards.
  useEffect(() => {
    if (!autoOpen) return;
    let alive = true;
    void (async () => {
      const res = await listCashiers();
      if (!alive) return;
      setCashiers(res.ok ? res.cashiers : []);
      setLoadingList(false);
    })();
    return () => {
      alive = false;
    };
  }, [autoOpen]);

  // Open + load profiles (in the handler — no setState-in-effect). If the
  // current operator still has an open shift, lead with the reconcile warning;
  // profiles load in the background so "Switch anyway" is instant.
  const openSwitcher = useCallback(async () => {
    setOpen(true);
    setStep(openShift ? "shiftWarn" : "select");
    setSelected(null);
    setPin("");
    setError(null);
    setLoadingList(true);
    const res = await listCashiers();
    setCashiers(res.ok ? res.cashiers : []);
    setLoadingList(false);
  }, [openShift]);

  const proceedToSelect = useCallback(() => {
    setStep("select");
    setError(null);
  }, []);

  const closeShiftFromWarn = useCallback(() => {
    close();
    onCloseShift?.();
  }, [close, onCloseShift]);

  const pickProfile = useCallback((c: CashierProfile) => {
    setSelected(c);
    setPin("");
    setError(null);
    setStep("pin");
  }, []);

  const backToSelect = useCallback(() => {
    setStep("select");
    setSelected(null);
    setPin("");
    setError(null);
    setForgot(false);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      setSubmitting(true);
      setError(null);
      const res = await switchByPin(value, selected ? { userId: selected.id } : {});
      if (res.ok) {
        window.location.assign(res.redirectTo);
        return;
      }
      setError(res.error);
      setPin("");
      setSubmitting(false);
    },
    [selected],
  );

  const push = useCallback(
    (digit: string) => {
      if (submitting) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) void submit(next);
        return next;
      });
    },
    [submit, submitting],
  );

  const backspace = useCallback(() => {
    if (submitting) return;
    setPin((prev) => prev.slice(0, -1));
  }, [submitting]);

  // Physical keyboard (PIN step only) + Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (step === "pin" && !forgot && e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        push(e.key);
      } else if (step === "pin" && !forgot && e.key === "Backspace") {
        e.preventDefault();
        backspace();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, forgot, push, backspace, close]);

  return (
    <>
      {!hideTrigger && (
        <button type="button" onClick={() => void openSwitcher()} className={triggerClassName}>
          <Icon name="users" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          {triggerLabel}
        </button>
      )}

      {open &&
        createPortal(
          // Portal to <body> so the fixed overlay escapes the POS header's
          // .glass (backdrop-filter) containing block — otherwise it'd be
          // trapped/clipped to the 60px header. The theme class is carried in so
          // dark-mode tokens resolve outside the app shell root; `text-ink` sets
          // the base text colour too (the portal isn't under .theme-root, so
          // headings/names would otherwise inherit browser-default black and go
          // invisible on the dark card).
          <div className={"text-ink " + (theme === "dark" ? "dark" : "")}>
            <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Switch cashier">
              {/* Blurred full-screen scrim */}
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="absolute inset-0 bg-black/40 backdrop-blur-md overlay-backdrop"
              />

          <div className="relative w-full max-w-[380px] rounded-xl2 bg-surface hairline shadow-soft overlay-card overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-2.5">
                {step === "pin" && (
                  <button
                    type="button"
                    onClick={backToSelect}
                    aria-label="Back to profiles"
                    className="grid place-items-center w-8 h-8 -ml-1 rounded-[9px] text-ink-soft hover:text-ink hover:bg-paper transition duration-150"
                  >
                    <Icon name="arrow" className="w-[18px] h-[18px] rotate-180" strokeWidth={1.8} />
                  </button>
                )}
                <div>
                  <h3 className="text-[1.15rem] font-extrabold tracking-tight">
                    {step === "shiftWarn"
                      ? "Shift still open"
                      : step === "select"
                        ? selectTitle
                        : "Enter your PIN"}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {step === "shiftWarn"
                      ? "Reconcile your drawer before handing over the till."
                      : step === "select"
                        ? selectSubtitle
                        : `Signing in as ${selected?.name ?? "cashier"} — 4 digits.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="text-ink-faint hover:text-ink transition -mt-1 -mr-1 p-1"
              >
                <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
              </button>
            </div>

            {/* Step content */}
            <div key={step} className="step-in px-6 pb-6">
              {step === "shiftWarn" ? (
                <div>
                  <div className="flex items-start gap-3 rounded-[12px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3.5">
                    <Icon name="receipt" className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" strokeWidth={1.8} />
                    <div className="text-[13px] leading-relaxed text-ink">
                      Your shift is still open
                      {openShift ? (
                        <>
                          {" "}— the drawer should hold{" "}
                          <span className="font-bold tabular-nums">{formatCents(openShift.expectedCashCents)}</span>
                        </>
                      ) : null}
                      . Switching hands the till to another cashier without closing
                      your shift, so the drawer won&apos;t be reconciled to you. End
                      your shift (Z-Read) first unless you&apos;re sure.
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2.5">
                    <button
                      type="button"
                      onClick={closeShiftFromWarn}
                      className="inline-flex items-center justify-center gap-2 w-full bg-brand-600 text-white font-bold text-[14px] py-3 rounded-[10px] hover:bg-brand-700 transition duration-150"
                    >
                      <Icon name="receipt" className="w-[18px] h-[18px]" strokeWidth={1.9} />
                      End my shift first
                    </button>
                    <button
                      type="button"
                      onClick={proceedToSelect}
                      className="inline-flex items-center justify-center gap-2 w-full bg-surface hairline text-ink-soft font-semibold text-[13.5px] py-2.5 rounded-[10px] hover:text-ink hover:border-brand-200 transition duration-150"
                    >
                      Switch anyway
                    </button>
                  </div>
                </div>
              ) : step === "select" ? (
                <div>
                  {loadingList ? (
                    <p className="py-8 text-center text-[13.5px] text-ink-soft">Loading profiles…</p>
                  ) : cashiers.length === 0 ? (
                    <p className="py-8 text-center text-[13.5px] text-ink-soft">
                      No cashier profiles set up for this store yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      {cashiers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickProfile(c)}
                          className="flex flex-col items-center gap-2 rounded-[12px] bg-paper hairline px-3 py-4 hover:border-brand-200 hover:bg-brand-50 active:scale-[0.98] transition duration-150 ease-in-out"
                        >
                          <span className="grid place-items-center w-11 h-11 rounded-full bg-brand-500 text-white font-bold text-[15px] tracking-tight">
                            {initials(c.name)}
                          </span>
                          <span className="text-[13.5px] font-bold tracking-tight text-center leading-tight line-clamp-2">
                            {c.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : forgot && selected ? (
                <ForgotPin preset={{ id: selected.id, name: selected.name }} onBack={() => setForgot(false)} />
              ) : (
                <>
                  <PinPad pin={pin} error={error} submitting={submitting} onPush={push} onBackspace={backspace} />
                  <div className="mt-5 flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => setForgot(true)}
                      className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition"
                    >
                      Forgot PIN?
                    </button>
                    <span className="text-ink-faint">·</span>
                    <button
                      type="button"
                      onClick={backToSelect}
                      className="text-[12px] font-semibold text-ink-faint hover:text-ink transition"
                    >
                      Different profile
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—"
  );
}

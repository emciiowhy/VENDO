"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { BrandMark } from "../BrandMark";
import { PinPad } from "../auth/PinPad";
import { switchByPin, type SessionUser } from "@/lib/auth";
import { listCashiers, openShift, type ActiveShift, type CashierProfile } from "@/lib/pos";
import { clockIn as apiClockIn, getClockStatus } from "@/lib/timecard";

/**
 * The mandatory POS terminal activation wizard — a single blocking overlay that
 * locks the whole register until the operator is genuinely ready to trade. It
 * walks one tunnel with five tracked stops:
 *
 *   Staff Login ➔ PIN Verify ➔ Clock In ➔ Open Drawer ➔ Active
 *
 * The terminal is "active" only when the cashier is BOTH on the labor clock (a
 * timecard) AND has an open cash-drawer shift (a `cashier_shifts` row) — the two
 * unrelated "shift" concepts the floor depends on. Until then this overlay owns
 * the screen and the catalog/cart behind it are blurred and inert.
 *
 * Reload discipline: binding a worker to the till is the existing PIN switch
 * (`/auth/pin`), which mints a fresh session cookie and reloads the page as that
 * cashier. So the Staff/PIN stops live *before* a reload and the Clock In/Drawer
 * stops live *after* it — the wizard derives its entry stage from live state, so
 * the reload is seamless. A cashier who reached the till via the login/handover
 * PIN screen is already identified, so they enter the tunnel at "Clock In" with
 * the first two stops already ticked; "Not you? Switch cashier" reopens them.
 *
 * Hooks discipline: the only effect here is the PIN keyboard listener, and it
 * mutates state strictly inside its event callback (never synchronously in the
 * effect body), so it satisfies `react-hooks/set-state-in-effect`. Every other
 * state change is driven by a user action or lands after an `await`.
 */

type Stage = "staff" | "pin" | "clockIn" | "drawer";

/** The breadcrumb path across the top of the card. "Active" is the goal node. */
const STEPS = ["Staff Login", "PIN Verify", "Clock In", "Open Drawer", "Active"] as const;
const STAGE_INDEX: Record<Stage, number> = { staff: 0, pin: 1, clockIn: 2, drawer: 3 };

const OPENING_PRESETS = [500, 1000, 2000, 3000]; // common baseline floats, pesos

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

export function ActivationWizard({
  user,
  clockedIn,
  defaultFloatCents,
  onClockedIn,
  onActivated,
  onExit,
}: {
  user: SessionUser;
  /**
   * Whether the bound operator already holds an open labor timecard. Drives the
   * entry stage: a clocked-in cashier (the wizard only shows when their drawer is
   * still closed) jumps to the drawer stop; otherwise they start at Clock In.
   */
  clockedIn: boolean;
  /** Owner-set default opening float (centavos), pre-filling the drawer stop. */
  defaultFloatCents: number;
  /** Lift the clock gate the moment the labor punch lands. */
  onClockedIn: () => void;
  /** Hand the freshly-opened drawer shift back so the workspace unlocks. */
  onActivated: (shift: ActiveShift) => void;
  /** Escape hatch — lock the till / return to the back office. */
  onExit: () => void;
}) {
  // Entry stage from live state: an identified cashier who isn't on the clock
  // starts at Clock In; one already clocked in (drawer still closed) jumps to
  // the drawer. The Staff/PIN stops are reached only via "Switch cashier".
  const [stage, setStage] = useState<Stage>(() => (clockedIn ? "drawer" : "clockIn"));

  const [selected, setSelected] = useState<CashierProfile | null>(null);
  const [cashiers, setCashiers] = useState<CashierProfile[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(() => (defaultFloatCents > 0 ? String(defaultFloatCents / 100) : ""));
  const openingCents = Math.round((Number(amount) || 0) * 100);

  const operatorName = selected?.name ?? user.name;
  const activeIndex = STAGE_INDEX[stage];

  // ── Stage 1: who's on duty? (load the roster, then pick a profile) ──────────
  const goToSwitch = useCallback(async () => {
    setStage("staff");
    setSelected(null);
    setPin("");
    setError(null);
    setLoadingList(true);
    const res = await listCashiers();
    setCashiers(res.ok ? res.cashiers : []);
    setLoadingList(false);
  }, []);

  const pickProfile = useCallback((c: CashierProfile) => {
    setSelected(c);
    setPin("");
    setError(null);
    setStage("pin");
  }, []);

  // ── Stage 2: verify the PIN, binding the worker to the floor session ────────
  // Success mints the cashier's session cookie and reloads the page as them; the
  // remounted wizard then derives its entry stage (Clock In) from live state.
  const submitPin = useCallback(
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

  const pushDigit = useCallback(
    (digit: string) => {
      if (submitting) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) void submitPin(next);
        return next;
      });
    },
    [submitPin, submitting],
  );

  const backspace = useCallback(() => {
    if (submitting) return;
    setPin((prev) => prev.slice(0, -1));
  }, [submitting]);

  // Physical keyboard on the PIN stop only. All state changes happen inside this
  // event callback — never in the effect body — so the hooks lint is satisfied.
  useEffect(() => {
    if (stage !== "pin") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setStage("clockIn"); // back out of the optional switch
        setSelected(null);
        setPin("");
        setError(null);
      } else if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        pushDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, pushDigit, backspace]);

  // ── Stage 3: clock in (open the labor timecard) ─────────────────────────────
  const doClockIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await apiClockIn();
    if (res.ok) {
      setBusy(false);
      onClockedIn();
      setStage("drawer");
      return;
    }
    // A 409 means we're already on the clock — that's success for this gate, so
    // confirm against the live status and advance rather than dead-ending.
    const status = await getClockStatus();
    setBusy(false);
    if (status.ok && status.timecard) {
      onClockedIn();
      setStage("drawer");
      return;
    }
    setError(res.error ?? "Could not clock you in.");
  }, [onClockedIn]);

  // ── Stage 4 → 5: open the cash drawer and unlock the workspace ──────────────
  const doOpenShift = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await openShift(openingCents);
    setBusy(false);
    if (res.ok) {
      onActivated(res.shift);
      return;
    }
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not open the shift."));
  }, [openingCents, onActivated]);

  const { title, subtitle } = stageCopy(stage, operatorName);

  return (
    <div
      className="fixed inset-0 z-[115] grid place-items-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label="Terminal activation"
    >
      <div className="absolute inset-0 glass overlay-backdrop" />

      <div className="relative flex flex-col w-full max-w-[460px] max-h-[92vh] overflow-hidden rounded-xl2 bg-surface hairline shadow-soft overlay-card">
        {/* Header — identity + the step path tracker */}
        <div className="shrink-0 px-6 pt-5 pb-4 hairline-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.tenantLogoUrl ? (
                // Store logo is a cross-origin uploads URL; plain <img> avoids Image config.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.tenantLogoUrl}
                  alt={user.tenantName ?? "Store"}
                  className="w-9 h-9 rounded-[9px] object-cover hairline shrink-0"
                />
              ) : (
                <BrandMark className="w-9 h-9 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  Terminal activation
                </div>
                <h2 className="text-[1.05rem] font-extrabold tracking-tightest leading-tight truncate">
                  {title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onExit}
              title="Exit terminal"
              aria-label="Exit terminal"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-[10px] bg-paper hairline px-2.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-rose-600 hover:border-rose-200 transition duration-150"
            >
              <Icon name="arrow" className="w-[16px] h-[16px] rotate-180" strokeWidth={1.8} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>

          <div className="mt-4">
            <StepTracker activeIndex={activeIndex} />
          </div>
        </div>

        {/* Stage body — re-keyed so each stop slides in */}
        <div key={stage} className="step-in flex-1 min-h-0 overflow-y-auto px-6 py-6">
          <p className="text-[13.5px] text-ink-soft leading-relaxed mb-5">{subtitle}</p>

          {stage === "staff" && (
            <StaffStep loading={loadingList} cashiers={cashiers} onPick={pickProfile} />
          )}

          {stage === "pin" && (
            <div>
              <PinPad pin={pin} error={error} submitting={submitting} onPush={pushDigit} onBackspace={backspace} />
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => void goToSwitch()}
                  className="text-[12.5px] font-semibold text-ink-faint hover:text-ink transition"
                >
                  Different profile
                </button>
              </div>
            </div>
          )}

          {stage === "clockIn" && (
            <div className="text-center">
              <span className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-brand-500 text-white font-extrabold text-[20px] tracking-tight">
                {initials(operatorName)}
              </span>
              <h3 className="mt-3.5 text-[1.2rem] font-extrabold tracking-tightest">{operatorName}</h3>
              <p className="mt-1 text-[12.5px] text-ink-soft">Confirm you’re on duty to start logging your hours.</p>

              {error && (
                <p className="mt-4 text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void doClockIn()}
                disabled={busy}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Icon name="clock" className="w-[18px] h-[18px]" strokeWidth={1.9} />
                {busy ? "Clocking in…" : "Clock In for Duty"}
              </button>

              <button
                type="button"
                onClick={() => void goToSwitch()}
                className="mt-3 text-[12.5px] font-semibold text-ink-faint hover:text-brand-600 transition"
              >
                Not you? Switch cashier
              </button>
            </div>
          )}

          {stage === "drawer" && (
            <div>
              <div className="rounded-[14px] bg-paper hairline px-4 py-4">
                <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">
                  <Icon name="wallet" className="w-[15px] h-[15px]" strokeWidth={1.8} />
                  Opening cash drawer balance
                </div>
                <label className="relative mt-2.5 block">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[15px]">₱</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !busy && amount !== "") {
                        e.preventDefault();
                        void doOpenShift();
                      }
                    }}
                    inputMode="decimal"
                    autoFocus
                    placeholder="0.00"
                    className="field-input rounded-[10px] pl-7 pr-3 py-3 text-[16px] w-full text-right tabular-nums font-bold"
                  />
                </label>
                <div className="mt-2.5 flex gap-2">
                  {OPENING_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(String(p))}
                      className="flex-1 rounded-[10px] bg-surface hairline py-2 text-[12.5px] font-bold tracking-tight text-ink hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 active:scale-[0.97] transition duration-150 tabular-nums"
                    >
                      ₱{p.toLocaleString("en-PH")}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-3 text-[12px] text-ink-faint flex items-start gap-1.5">
                <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.7} />
                This baseline change is what your drawer is reconciled against at the Z-Read.
              </p>

              {error && (
                <p className="mt-3 text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void doOpenShift()}
                disabled={busy || amount === ""}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="lock" className="w-[18px] h-[18px]" strokeWidth={1.9} />
                {busy ? "Opening…" : "Open Shift & Unlock Terminal"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- step tracker ------------------------------- */

function StepTracker({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto scrollbar-none select-none">
      {STEPS.map((label, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <li key={label} className="flex items-center gap-1.5 shrink-0">
            <span
              className={
                "grid place-items-center w-[18px] h-[18px] rounded-full text-[10px] font-extrabold tabular-nums transition duration-150 " +
                (done
                  ? "bg-accent-500 text-white"
                  : current
                    ? "bg-brand-500 text-white ring-2 ring-brand-200"
                    : "bg-paper hairline text-ink-faint")
              }
            >
              {done ? <Icon name="check" className="w-3 h-3" strokeWidth={2.6} /> : i + 1}
            </span>
            <span
              className={
                "text-[11px] font-bold tracking-tight whitespace-nowrap " +
                (current ? "text-ink" : done ? "text-accent-600" : "text-ink-faint")
              }
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <Icon name="arrow" className="w-[13px] h-[13px] text-ink-faint mx-0.5 shrink-0" strokeWidth={1.9} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------- staff step -------------------------------- */

function StaffStep({
  loading,
  cashiers,
  onPick,
}: {
  loading: boolean;
  cashiers: CashierProfile[];
  onPick: (c: CashierProfile) => void;
}) {
  if (loading) {
    return <p className="py-8 text-center text-[13.5px] text-ink-soft">Loading profiles…</p>;
  }
  if (cashiers.length === 0) {
    return (
      <p className="py-8 text-center text-[13.5px] text-ink-soft">
        No cashier profiles set up for this store yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {cashiers.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c)}
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
  );
}

/* ---------------------------------- copy ---------------------------------- */

function stageCopy(stage: Stage, operatorName: string): { title: string; subtitle: string } {
  switch (stage) {
    case "staff":
      return { title: "Who’s on duty?", subtitle: "Select your profile to take the till." };
    case "pin":
      return {
        title: "Enter PIN to start shift",
        subtitle: `Verifying ${operatorName} — key your 4-digit PIN to take the till.`,
      };
    case "clockIn":
      return {
        title: "Clock in for duty",
        subtitle: "Log your labor hours before you open the cash drawer.",
      };
    case "drawer":
      return {
        title: "Open your cash drawer",
        subtitle: "Count the cash already in the drawer (your baseline change) to start the shift.",
      };
  }
}

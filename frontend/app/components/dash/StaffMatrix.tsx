"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { formatPesoExact } from "@/lib/format";
import {
  createCashier,
  deleteCashier,
  forceCloseShift,
  getStaff,
  rejectPinRequest,
  setCashierPin,
  updateCashier,
  type CashierSummary,
  type PinRequest,
} from "@/lib/staff";

/**
 * Owner cashier console — full CRUD over the store's cashiers plus their shift &
 * cash-drawer link. Owners add/rename/enable-disable/remove cashiers, set their
 * 4-digit PINs and a default opening cash float, see who's on the till right now,
 * force-close a stuck shift, and action pending forgot-PIN requests. Cashiers
 * never set their own PIN. Everything is tenant-scoped server-side.
 */
type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; cashiers: CashierSummary[]; requests: PinRequest[] };

const peso = (cents: number) => formatPesoExact(cents / 100);

export function StaffMatrix() {
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [setPinFor, setSetPinFor] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<CashierSummary | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [forceClosing, setForceClosing] = useState<CashierSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getStaff();
    if (res.ok) setState({ status: "ready", cashiers: res.cashiers, requests: res.requests });
    else setState({ status: "error", message: res.error ?? "Could not load staff." });
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getStaff();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", cashiers: res.cashiers, requests: res.requests });
      else setState({ status: "error", message: res.error ?? "Could not load staff." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function dismiss(req: PinRequest) {
    const res = await rejectPinRequest(req.id);
    if (res.ok) {
      push({ variant: "info", title: `Dismissed ${req.cashierName}'s request` });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't dismiss request", message: res.error });
    }
  }

  async function toggleStatus(c: CashierSummary) {
    const next = c.status === "active" ? "disabled" : "active";
    setBusyId(c.id);
    const res = await updateCashier(c.id, { status: next });
    setBusyId(null);
    if (res.ok) {
      push({
        variant: next === "active" ? "success" : "info",
        title: next === "active" ? `${c.name} re-enabled` : `${c.name} disabled`,
        message: next === "disabled" ? "They can no longer sign in to a terminal." : undefined,
      });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't update cashier", message: res.error });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setBusyId(target.id);
    const res = await deleteCashier(target.id);
    setBusyId(null);
    setDeleting(null);
    if (res.ok) {
      push({ variant: "info", title: `Removed ${target.name}` });
      void load();
    } else {
      push({ variant: "danger", title: "Couldn't remove cashier", message: res.error });
    }
  }

  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error") {
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center max-w-[920px]">
        <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
      </div>
    );
  }

  const activeCount = state.cashiers.filter((c) => c.status === "active").length;
  const onTill = state.cashiers.filter((c) => c.shift).length;

  return (
    <div className="space-y-7 max-w-[920px]">
      {/* Pending PIN-reset requests */}
      {state.requests.length > 0 && (
        <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden ring-1 ring-amber-200 dark:ring-amber-500/30">
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 hairline-b bg-amber-50/60 dark:bg-amber-500/10">
            <h3 className="font-extrabold tracking-tight flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Icon name="lock" className="w-[18px] h-[18px]" strokeWidth={1.9} />
              PIN reset requests
            </h3>
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 rounded-full px-2.5 py-0.5">
              {state.requests.length} pending
            </span>
          </div>
          <ul className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
            {state.requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 sm:px-6 py-3.5">
                <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-500 text-white font-bold text-[13px] shrink-0">
                  {initials(r.cashierName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold tracking-tight truncate">{r.cashierName}</div>
                  <div className="text-[12px] text-ink-faint">requested {timeAgo(r.createdAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSetPinFor({ id: r.cashierUserId, name: r.cashierName })}
                  className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 py-2 rounded-[10px] shadow-btn transition duration-150"
                >
                  <Icon name="lock" className="w-4 h-4" strokeWidth={1.9} />
                  Set new PIN
                </button>
                <button
                  type="button"
                  onClick={() => void dismiss(r)}
                  className="text-[13px] font-semibold text-ink-soft hover:text-rose-600 px-2 py-2 transition"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cashier roster */}
      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 hairline-b">
          <div>
            <h3 className="font-extrabold tracking-tight">Cashiers</h3>
            <p className="text-[12.5px] text-ink-soft">
              {activeCount} active
              {state.cashiers.length > activeCount && ` · ${state.cashiers.length - activeCount} disabled`}
              {onTill > 0 && ` · ${onTill} on the till`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 py-2 rounded-[10px] shadow-btn transition duration-150"
          >
            <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
            Add cashier
          </button>
        </div>
        {state.cashiers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[13.5px] text-ink-soft">No cashiers yet.</p>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-3 inline-flex items-center gap-1.5 bg-surface hairline rounded-[10px] px-3.5 py-2 text-[13px] font-semibold hover:border-brand-200 hover:text-brand-600 transition duration-150"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Add your first cashier
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
            {state.cashiers.map((c) => {
              const disabled = c.status !== "active";
              return (
                <li
                  key={c.id}
                  className={"flex items-center gap-3 px-5 sm:px-6 py-3.5" + (disabled ? " opacity-60" : "")}
                >
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-ink dark:bg-[#0b1220] text-white font-bold text-[13px] shrink-0">
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold tracking-tight truncate">{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      {disabled ? (
                        <span className="text-[11px] font-bold text-ink-soft bg-paper hairline rounded-full px-2 py-0.5">
                          Disabled
                        </span>
                      ) : c.hasPin ? (
                        <span className="text-[11px] font-bold text-accent-600 bg-accent-50 rounded-full px-2 py-0.5">
                          PIN set
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                          No PIN
                        </span>
                      )}
                      {c.pendingRequest && (
                        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                          reset requested
                        </span>
                      )}
                      {c.defaultFloatCents > 0 && (
                        <span className="text-[11px] font-semibold text-ink-soft bg-paper hairline rounded-full px-2 py-0.5">
                          Float {peso(c.defaultFloatCents)}
                        </span>
                      )}
                    </div>
                    {c.shift && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-500/10 rounded-full px-2.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
                        On till · opened {timeAgo(c.shift.openedAt)} · drawer {peso(c.shift.expectedCashCents)}
                      </div>
                    )}
                  </div>

                  {c.shift && (
                    <button
                      type="button"
                      onClick={() => setForceClosing(c)}
                      className="inline-flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-500/30 rounded-[10px] px-3 py-2 text-[13px] font-semibold hover:bg-amber-100 transition duration-150"
                    >
                      <Icon name="lock" className="w-4 h-4" strokeWidth={1.8} />
                      Force close
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSetPinFor({ id: c.id, name: c.name })}
                    className="inline-flex items-center gap-1.5 bg-surface hairline rounded-[10px] px-3.5 py-2 text-[13px] font-semibold hover:border-brand-200 hover:text-brand-600 transition duration-150"
                  >
                    <Icon name="lock" className="w-4 h-4" strokeWidth={1.7} />
                    {c.hasPin ? "Change PIN" : "Set PIN"}
                  </button>

                  <RowIcon label="Edit" icon="pencil" onClick={() => setEditing(c)} />
                  <RowIcon
                    label={disabled ? "Enable" : "Disable"}
                    icon={disabled ? "check" : "ban"}
                    busy={busyId === c.id}
                    onClick={() => void toggleStatus(c)}
                    tone={disabled ? "accent" : "default"}
                  />
                  <RowIcon
                    label="Remove"
                    icon="trash"
                    tone="danger"
                    onClick={() => setDeleting({ id: c.id, name: c.name })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {adding && (
        <CashierFormModal
          onClose={() => setAdding(false)}
          onDone={(name) => {
            push({ variant: "success", title: `Added ${name}` });
            setAdding(false);
            void load();
          }}
        />
      )}

      {editing && (
        <CashierFormModal
          cashier={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            push({ variant: "success", title: "Cashier updated" });
            setEditing(null);
            void load();
          }}
        />
      )}

      {setPinFor && (
        <SetPinModal
          cashier={setPinFor}
          onClose={() => setSetPinFor(null)}
          onDone={() => {
            push({ variant: "success", title: `PIN updated for ${setPinFor.name}` });
            setSetPinFor(null);
            void load();
          }}
        />
      )}

      {forceClosing && forceClosing.shift && (
        <ForceCloseModal
          cashier={forceClosing}
          onClose={() => setForceClosing(null)}
          onDone={(variance) => {
            push({
              variant: variance === 0 ? "success" : "info",
              title: `Closed ${forceClosing.name}'s shift`,
              message:
                variance === 0
                  ? "Drawer balanced."
                  : `${variance > 0 ? "Overage" : "Shortage"} ${peso(Math.abs(variance))}.`,
            });
            setForceClosing(null);
            void load();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Remove ${deleting.name}?`}
          message="Their cashier profile and PIN are deleted. Past sales and shift records are kept but no longer linked to a name. This can't be undone."
          confirmLabel="Remove cashier"
          icon="trash"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function RowIcon({
  label,
  icon,
  onClick,
  busy,
  tone = "default",
}: {
  label: string;
  icon: "pencil" | "ban" | "check" | "trash";
  onClick: () => void;
  busy?: boolean;
  tone?: "default" | "danger" | "accent";
}) {
  const hover =
    tone === "danger"
      ? "hover:text-rose-600 hover:border-rose-200"
      : tone === "accent"
        ? "hover:text-accent-600 hover:border-accent-200"
        : "hover:text-brand-600 hover:border-brand-200";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={
        "grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft transition duration-150 disabled:opacity-50 " +
        hover
      }
    >
      <Icon name={busy ? "refresh" : icon} className={"w-4 h-4" + (busy ? " animate-spin" : "")} strokeWidth={1.7} />
    </button>
  );
}

/** Add (no cashier) or Edit (cashier given) — name, default float, and PIN on add. */
function CashierFormModal({
  cashier,
  onClose,
  onDone,
}: {
  cashier?: CashierSummary;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const isEdit = !!cashier;
  const [name, setName] = useState(cashier?.name ?? "");
  const [float, setFloat] = useState(
    cashier && cashier.defaultFloatCents > 0 ? String(cashier.defaultFloatCents / 100) : "",
  );
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wantsPin = !isEdit && (pin.length > 0 || confirm.length > 0);
  const floatCents = Math.round((Number(float) || 0) * 100);

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length < 1) return setError("Enter the cashier's name.");
    if (wantsPin) {
      if (!/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits.");
      if (pin !== confirm) return setError("The two PINs don't match.");
    }
    setBusy(true);
    setError(null);
    const res = isEdit
      ? await updateCashier(cashier!.id, { name: trimmed, defaultFloatCents: floatCents })
      : await createCashier({ name: trimmed, pin: wantsPin ? pin : undefined, defaultFloatCents: floatCents });
    if (res.ok) {
      onDone(trimmed);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save the cashier."));
  }

  const unchanged =
    isEdit && name.trim() === cashier!.name && floatCents === cashier!.defaultFloatCents;

  return (
    <ModalShell label={isEdit ? "Edit cashier" : "Add cashier"} onClose={onClose}>
      <div>
        <h3 className="text-[1.1rem] font-extrabold tracking-tight">{isEdit ? "Edit cashier" : "Add cashier"}</h3>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {isEdit
            ? "Update the name and default opening cash float."
            : "A new cashier profile for your store. PIN is optional — set it now or later."}
        </p>
      </div>
      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
            placeholder="e.g. Maria Santos"
            className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Default opening cash float</span>
          <span className="relative mt-1.5 block">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[15px]">₱</span>
            <input
              value={float}
              onChange={(e) => setFloat(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="0.00"
              className="field-input rounded-[10px] pl-7 pr-3 py-2.5 text-[14px] w-full text-right tabular-nums"
            />
          </span>
          <span className="mt-1 block text-[11.5px] text-ink-faint">
            Pre-fills the cashier&apos;s drawer when they open a shift. Leave 0 to have them key it in.
          </span>
        </label>
        {!isEdit && (
          <>
            <PinField label="PIN (optional)" value={pin} onChange={setPin} />
            {wantsPin && <PinField label="Confirm PIN" value={confirm} onChange={setConfirm} />}
          </>
        )}
        {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || name.trim().length < 1 || unchanged}
        className="mt-5 w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Saving…" : isEdit ? "Save changes" : "Add cashier"}
      </button>
    </ModalShell>
  );
}

function ForceCloseModal({
  cashier,
  onClose,
  onDone,
}: {
  cashier: CashierSummary;
  onClose: () => void;
  onDone: (variance: number) => void;
}) {
  const expected = cashier.shift!.expectedCashCents;
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCount = counted.trim() !== "";
  const countedCents = Math.round((Number(counted) || 0) * 100);
  const previewVariance = hasCount ? countedCents - expected : 0;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await forceCloseShift(cashier.id, {
      countedCents: hasCount ? countedCents : undefined,
      note: note.trim() || undefined,
    });
    if (res.ok) {
      onDone(res.zread.cashVarianceCents);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not close the shift."));
  }

  return (
    <ModalShell label="Force close shift" onClose={onClose}>
      <div>
        <h3 className="text-[1.1rem] font-extrabold tracking-tight">Force close shift</h3>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          Z-Read {cashier.name}&apos;s open drawer. Use this when they left without closing out.
        </p>
      </div>

      <div className="mt-4 rounded-[12px] bg-paper hairline divide-y divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.07)] text-[13px]">
        <Row label="Opening float" value={peso(cashier.shift!.openingCents)} />
        <Row label="Expected drawer cash" value={peso(expected)} strong />
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Physical cash count (optional)</span>
          <span className="relative mt-1.5 block">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[15px]">₱</span>
            <input
              value={counted}
              onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="Leave blank if not counted"
              className="field-input rounded-[10px] pl-7 pr-3 py-2.5 text-[14px] w-full text-right tabular-nums"
            />
          </span>
        </label>
        {hasCount && (
          <div
            className={
              "flex items-center justify-between rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold " +
              (previewVariance === 0
                ? "bg-accent-50 text-accent-600"
                : previewVariance > 0
                  ? "bg-amber-50 text-amber-600"
                  : "bg-rose-50 text-rose-600")
            }
          >
            <span>{previewVariance === 0 ? "Balances" : previewVariance > 0 ? "Overage" : "Shortage"}</span>
            <span className="tabular-nums">
              {previewVariance === 0
                ? peso(0)
                : `${previewVariance > 0 ? "+" : "−"}${peso(Math.abs(previewVariance))}`}
            </span>
          </div>
        )}
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="e.g. cashier left early"
            className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5"
          />
        </label>
        {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-5 w-full rounded-[10px] bg-amber-500 hover:bg-amber-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Closing…" : hasCount ? "Close & reconcile" : "Close without counting"}
      </button>
    </ModalShell>
  );
}

function SetPinModal({
  cashier,
  onClose,
  onDone,
}: {
  cashier: { id: string; name: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\d{4}$/.test(pin);
  const matches = pin === confirm;

  async function submit() {
    if (!valid) return setError("PIN must be exactly 4 digits.");
    if (!matches) return setError("The two PINs don't match.");
    setBusy(true);
    setError(null);
    const res = await setCashierPin(cashier.id, pin);
    if (res.ok) {
      onDone();
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not update the PIN."));
  }

  return (
    <ModalShell label="Set cashier PIN" onClose={onClose}>
      <div>
        <h3 className="text-[1.1rem] font-extrabold tracking-tight">Set PIN</h3>
        <p className="mt-0.5 text-[13px] text-ink-soft">A new 4-digit PIN for {cashier.name}.</p>
      </div>
      <div className="mt-5 space-y-3">
        <PinField label="New PIN" value={pin} onChange={setPin} autoFocus />
        <PinField label="Confirm PIN" value={confirm} onChange={setConfirm} />
        {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !valid || !matches}
        className="mt-5 w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Saving…" : "Save PIN"}
      </button>
    </ModalShell>
  );
}

function ModalShell({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[380px] rounded-xl2 bg-surface hairline shadow-soft overlay-card p-6">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink-faint hover:text-ink p-1">
          <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
        </button>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-ink-soft">{label}</span>
      <span className={"tabular-nums tracking-tight " + (strong ? "font-extrabold text-ink" : "font-semibold")}>
        {value}
      </span>
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder="••••"
        className="field-input rounded-[10px] px-3.5 py-2.5 text-[18px] w-full mt-1.5 text-center tracking-[0.5em] tabular-nums"
      />
    </label>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 max-w-[920px] animate-pulse">
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[120px]" />
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[240px]" />
    </div>
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

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

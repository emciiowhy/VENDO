"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatMinutes } from "@/lib/timecard";
import {
  correctCashierTimecard,
  getCashierAttendance,
  getStoreAttendance,
  type CashierAttendanceRow,
  type CashierDay,
  type CashierPunch,
  type StoreAttendanceDay,
} from "@/lib/staff";

/**
 * Cashier attendance — how many hours each cashier worked, read from their
 * Shift In / Shift Out on the till. A month table (days worked, hours) beside a
 * calendar: the whole store by default, or one cashier once you pick them, where
 * tapping a day lists its punches. There is deliberately no payroll — the owner
 * works out pay from these hours (Export CSV hands them over). A forgotten Shift
 * Out counts no hours until the owner enters the real Time Out here.
 * All dates and times are Manila time, matching how the server buckets punches.
 */

const MNL_OFFSET_MS = 8 * 60 * 60 * 1000;
const manilaNow = () => new Date(Date.now() + MNL_OFFSET_MS).toISOString();
const thisMonth = () => manilaNow().slice(0, 7);
const today = () => manilaNow().slice(0, 10);

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
}
/** ISO instant → the Manila wall-clock value a datetime-local input expects. */
function toLocalInput(iso: string): string {
  return new Date(Date.parse(iso) + MNL_OFFSET_MS).toISOString().slice(0, 16);
}
/** A datetime-local value, read as Manila time → ISO instant with offset. */
function fromLocalInput(value: string): string {
  return `${value}:00+08:00`;
}
const hours = (minutes: number) => (minutes <= 0 ? "—" : formatMinutes(minutes));

type Store = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: CashierAttendanceRow[]; days: StoreAttendanceDay[] };
type Person = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; days: CashierDay[] };

export function CashierAttendance() {
  const [month, setMonth] = useState(thisMonth);
  const [store, setStore] = useState<Store>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [person, setPerson] = useState<Person>({ status: "loading" });
  const [day, setDay] = useState<string | null>(null);

  const loadStore = useCallback(async (m: string) => {
    const res = await getStoreAttendance(m);
    if (res.ok) setStore({ status: "ready", rows: res.rows, days: res.days });
    else setStore({ status: "error", message: res.error ?? "Could not load attendance." });
  }, []);

  const loadPerson = useCallback(async (id: string, m: string) => {
    const res = await getCashierAttendance(id, m);
    if (res.ok) setPerson({ status: "ready", days: res.days });
    else setPerson({ status: "error", message: res.error ?? "Could not load attendance." });
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getStoreAttendance(month);
      if (!alive) return;
      if (res.ok) setStore({ status: "ready", rows: res.rows, days: res.days });
      else setStore({ status: "error", message: res.error ?? "Could not load attendance." });
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void (async () => {
      const res = await getCashierAttendance(selectedId, month);
      if (!alive) return;
      if (res.ok) setPerson({ status: "ready", days: res.days });
      else setPerson({ status: "error", message: res.error ?? "Could not load attendance." });
    })();
    return () => {
      alive = false;
    };
  }, [selectedId, month]);

  function goMonth(next: string) {
    setMonth(next);
    setDay(null);
    setStore({ status: "loading" });
    if (selectedId) setPerson({ status: "loading" });
  }
  function pick(id: string | null) {
    setSelectedId(id);
    setDay(null);
    if (id) setPerson({ status: "loading" });
  }
  async function refresh() {
    await Promise.all([loadStore(month), selectedId ? loadPerson(selectedId, month) : null]);
  }

  const rows = store.status === "ready" ? store.rows : [];
  const selected = rows.find((r) => r.userId === selectedId) ?? null;
  const totalMinutes = rows.reduce((n, r) => n + r.workedMinutes, 0);
  const worked = rows.filter((r) => r.workedMinutes > 0).length;
  const review = rows.reduce((n, r) => n + r.needsReview, 0);
  const atLatest = month >= thisMonth();

  function exportCsv() {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["Cashier", "Days worked", "Hours worked", "Minutes worked", "Punches", "Needs review"].map(cell).join(","),
      ...rows.map((r) =>
        [r.name, r.daysWorked, (r.workedMinutes / 60).toFixed(2), r.workedMinutes, r.punches, r.needsReview].map(cell).join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashier-hours-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Month bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-[12px] bg-surface hairline p-1">
          <button
            type="button"
            onClick={() => goMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-soft hover:text-ink hover:bg-paper transition"
          >
            <Icon name="chevron" className="w-4 h-4 rotate-90" strokeWidth={2} />
          </button>
          <span className="min-w-[9.5rem] text-center text-[14px] font-bold tracking-tight">{monthLabel(month)}</span>
          <button
            type="button"
            onClick={() => goMonth(shiftMonth(month, 1))}
            disabled={atLatest}
            aria-label="Next month"
            className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-soft hover:text-ink hover:bg-paper transition disabled:opacity-35 disabled:pointer-events-none"
          >
            <Icon name="chevron" className="w-4 h-4 -rotate-90" strokeWidth={2} />
          </button>
        </div>
        {!atLatest && (
          <button type="button" onClick={() => goMonth(thisMonth())} className="text-[13px] font-semibold text-brand-600 hover:text-brand-700 transition">
            This month
          </button>
        )}
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 bg-surface hairline rounded-[10px] px-3.5 py-2 text-[13px] font-semibold hover:border-brand-200 hover:text-brand-600 transition duration-150 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Icon name="download" className="w-4 h-4" strokeWidth={1.9} />
          Export hours (CSV)
        </button>
      </div>

      {store.status === "error" ? (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{store.message}</p>
        </div>
      ) : (
        <>
          {/* Month totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Hours worked" value={store.status === "ready" ? hours(totalMinutes) : "…"} sub="all cashiers, this month" />
            <Stat label="Cashiers who worked" value={store.status === "ready" ? `${worked} of ${rows.length}` : "…"} sub="clocked any hours" />
            <Stat
              label="Missing Time Out"
              value={store.status === "ready" ? String(review) : "…"}
              sub={review > 0 ? "count no hours until you fix them" : "nothing to fix"}
              warn={review > 0}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
            {/* Cashier table */}
            <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
              <div className="px-5 py-4 hairline-b">
                <h3 className="font-extrabold tracking-tight">Hours by cashier</h3>
                <p className="text-[12.5px] text-ink-soft">Pick a cashier to see their days on the calendar.</p>
              </div>
              {store.status === "loading" ? (
                <div className="p-5 space-y-2.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 rounded-[10px] bg-paper animate-pulse" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13.5px] text-ink-soft">No cashiers yet — add one in the Cashiers tab.</p>
              ) : (
                <ul className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
                  <li>
                    <RowButton on={selectedId === null} onClick={() => pick(null)}>
                      <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-50 text-brand-700 shrink-0">
                        <Icon name="users" className="w-4 h-4" strokeWidth={1.9} />
                      </span>
                      <span className="flex-1 min-w-0 text-[13.5px] font-bold tracking-tight">All cashiers</span>
                      <span className="text-[13px] font-bold tabular-nums">{hours(totalMinutes)}</span>
                    </RowButton>
                  </li>
                  {rows.map((r) => (
                    <li key={r.userId}>
                      <RowButton on={selectedId === r.userId} onClick={() => pick(r.userId)}>
                        <span className="grid place-items-center w-8 h-8 rounded-full bg-ink dark:bg-[#0b1220] text-white font-bold text-[12px] shrink-0">
                          {initials(r.name)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] font-bold tracking-tight truncate">
                            {r.name}
                            {r.status !== "active" && <span className="ml-1.5 text-[11px] font-semibold text-ink-faint">(disabled)</span>}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-faint">
                            {r.daysWorked} {r.daysWorked === 1 ? "day" : "days"}
                            {r.onClock && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent-600 bg-accent-50 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse" />
                                On the clock
                              </span>
                            )}
                            {r.needsReview > 0 && (
                              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-400 rounded-full px-2 py-0.5">
                                {r.needsReview} missing Time Out
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="text-[13px] font-bold tabular-nums">{hours(r.workedMinutes)}</span>
                      </RowButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Calendar + day detail */}
            <div className="rounded-xl2 bg-surface hairline shadow-card p-5 space-y-4">
              <div>
                <h3 className="font-extrabold tracking-tight">{selected ? selected.name : "Whole store"}</h3>
                <p className="text-[12.5px] text-ink-soft">
                  {selected
                    ? `${hours(selected.workedMinutes)} over ${selected.daysWorked} ${selected.daysWorked === 1 ? "day" : "days"} · tap a day for its Shift In / Out`
                    : "Hours all cashiers clocked each day"}
                </p>
              </div>
              {store.status === "loading" || (selectedId && person.status === "loading") ? (
                <div className="aspect-[7/5] rounded-[12px] bg-paper animate-pulse" />
              ) : selectedId && person.status === "error" ? (
                <p className="text-[13.5px] font-semibold text-rose-600">{person.message}</p>
              ) : (
                <MonthCalendar
                  month={month}
                  cells={
                    selectedId && person.status === "ready"
                      ? person.days.map((d) => ({ date: d.date, minutes: d.workedMinutes, review: d.needsReview }))
                      : store.status === "ready"
                        ? store.days.map((d) => ({ date: d.date, minutes: d.workedMinutes, review: d.needsReview, note: `${d.cashiers} on shift` }))
                        : []
                  }
                  selected={day}
                  onSelect={selectedId ? setDay : undefined}
                />
              )}
              {selectedId && day && person.status === "ready" && (
                <DayPanel
                  date={day}
                  day={person.days.find((d) => d.date === day) ?? null}
                  onClose={() => setDay(null)}
                  onSaved={refresh}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, warn = false }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={"rounded-xl2 bg-surface hairline shadow-card px-5 py-4" + (warn ? " ring-1 ring-amber-200 dark:ring-amber-500/30" : "")}>
      <div className="text-[12px] font-semibold text-ink-faint">{label}</div>
      <div className={"mt-1 text-[1.45rem] font-extrabold tracking-tightest tabular-nums" + (warn ? " text-amber-700 dark:text-amber-400" : "")}>
        {value}
      </div>
      <div className="text-[12px] text-ink-soft">{sub}</div>
    </div>
  );
}

function RowButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        "w-full flex items-center gap-3 px-5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 " +
        (on ? "bg-brand-50" : "hover:bg-paper")
      }
    >
      {children}
    </button>
  );
}

/** Shade a day by hours: a short day reads light, a full day reads strong. */
function cellTone(minutes: number): string {
  if (minutes <= 0) return "bg-paper text-ink-faint";
  if (minutes < 4 * 60) return "bg-brand-100 text-brand-700";
  if (minutes < 8 * 60) return "bg-brand-400 text-white";
  return "bg-brand-600 text-white";
}

function MonthCalendar({
  month,
  cells,
  selected,
  onSelect,
}: {
  month: string;
  cells: { date: string; minutes: number; review: boolean; note?: string }[];
  selected: string | null;
  onSelect?: (date: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sun
  const byDate = new Map(cells.map((c) => [c.date, c]));
  const now = today();
  const grid: (string | null)[] = [...Array<null>(lead).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) grid.push(`${month}-${String(d).padStart(2, "0")}`);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} className="text-[11px] font-bold text-ink-faint pb-1">
            {w}
          </div>
        ))}
        {grid.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />;
          const c = byDate.get(date);
          const minutes = c?.minutes ?? 0;
          const future = date > now;
          const label = `${dateLabel(date)}: ${minutes > 0 ? formatMinutes(minutes) : "no hours"}${c?.note && minutes > 0 ? `, ${c.note}` : ""}${c?.review ? ", missing Time Out" : ""}`;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect?.(date)}
              disabled={!onSelect || future}
              aria-pressed={selected === date}
              aria-label={label}
              title={label}
              className={
                "relative aspect-square rounded-[9px] flex flex-col items-center justify-center text-[12px] transition " +
                (future ? "bg-transparent text-ink-faint/60" : cellTone(minutes)) +
                (c?.review ? " ring-2 ring-amber-400" : "") +
                (date === now ? " font-extrabold underline underline-offset-2" : "") +
                (selected === date ? " outline outline-2 outline-offset-2 outline-brand-500" : "") +
                (onSelect && !future ? " cursor-pointer hover:brightness-95" : " cursor-default")
              }
            >
              <span className="font-semibold leading-none">{Number(date.slice(8))}</span>
              {minutes > 0 && <span className="text-[9px] opacity-90 leading-none mt-0.5">{formatMinutes(minutes).replace(" 0m", "")}</span>}
              {c?.review && <span className="absolute top-0.5 right-1 text-[10px] font-extrabold text-amber-600">!</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-soft">
        <Legend tone={cellTone(60)} label="Under 4h" />
        <Legend tone={cellTone(5 * 60)} label="4–8h" />
        <Legend tone={cellTone(8 * 60)} label="8h+" />
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] bg-paper ring-2 ring-amber-400" />
          Missing Time Out
        </span>
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={"w-3 h-3 rounded-[4px] " + tone} />
      {label}
    </span>
  );
}

function DayPanel({
  date,
  day,
  onClose,
  onSaved,
}: {
  date: string;
  day: CashierDay | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <div className="rounded-[14px] bg-paper hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-bold tracking-tight">{dateLabel(date)}</div>
          <div className="text-[12px] text-ink-soft">{day ? `${hours(day.workedMinutes)} worked` : "No Shift In this day"}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close day" className="text-ink-faint hover:text-ink transition">
          <Icon name="x" className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
      {day && (
        <ul className="mt-3 space-y-2">
          {day.punches.map((p) => (
            <PunchRow key={p.id} punch={p} onSaved={onSaved} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PunchRow({ punch, onSaved }: { punch: CashierPunch; onSaved: () => Promise<void> }) {
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [timeIn, setTimeIn] = useState(() => toLocalInput(punch.clockIn));
  const [timeOut, setTimeOut] = useState(() => toLocalInput(punch.clockOut && punch.clockOut !== punch.clockIn ? punch.clockOut : punch.clockIn));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await correctCashierTimecard(punch.id, { clockIn: fromLocalInput(timeIn), clockOut: fromLocalInput(timeOut) });
    setSaving(false);
    if (!res.ok) {
      push({ variant: "danger", title: "Couldn't save the times", message: res.error });
      return;
    }
    push({ variant: "success", title: "Shift times saved" });
    setEditing(false);
    await onSaved();
  }

  return (
    <li className={"rounded-[12px] bg-surface hairline px-3.5 py-3" + (punch.needsReview ? " ring-1 ring-amber-300 dark:ring-amber-500/40" : "")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icon name="clock" className="w-4 h-4 text-ink-faint" strokeWidth={1.8} />
        <span className="text-[13px] font-semibold tabular-nums">
          {timeLabel(punch.clockIn)} –{" "}
          {punch.open ? "still on the clock" : punch.needsReview ? "no Time Out" : timeLabel(punch.clockOut!)}
        </span>
        <span className="ml-auto text-[13px] font-bold tabular-nums">{punch.needsReview ? "—" : formatMinutes(punch.minutes)}</span>
        {!punch.open && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={
              "text-[12.5px] font-semibold transition " +
              (punch.needsReview ? "text-amber-700 dark:text-amber-400 hover:underline" : "text-ink-soft hover:text-brand-600")
            }
          >
            {punch.needsReview ? "Enter Time Out" : "Edit"}
          </button>
        )}
      </div>
      {punch.needsReview && !editing && (
        <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">They didn’t Shift Out. Enter the real time so these hours count.</p>
      )}
      {editing && (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto] items-end">
          <label className="block">
            <span className="text-[11.5px] font-semibold text-ink-faint">Time In</span>
            <input
              type="datetime-local"
              value={timeIn}
              onChange={(e) => setTimeIn(e.target.value)}
              className="mt-1 w-full h-9 rounded-[9px] bg-paper hairline px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-semibold text-ink-faint">Time Out</span>
            <input
              type="datetime-local"
              value={timeOut}
              onChange={(e) => setTimeOut(e.target.value)}
              className="mt-1 w-full h-9 rounded-[9px] bg-paper hairline px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !timeIn || !timeOut}
              className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 h-9 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-[13px] font-semibold text-ink-soft hover:text-ink px-1.5 transition">
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

"use client";

import { useState } from "react";
import { Icon } from "../Icon";
import { clearAttendance, correctTimecard, saveAttendance, type AttendanceDay, type PunchView } from "@/lib/hr";
import { STATUS_STYLE, fmtHours } from "./AttendanceCalendar";

/**
 * The details of one attendance day: status, every Shift In / Shift Out, the
 * unpaid break and the worked hours. With `employeeId` set (owner/manager view)
 * it also offers the fixes — enter the real Time Out for a forgotten Shift Out,
 * or mark the day Leave / Absent / Present by hand. Every fix is server-checked
 * (owner/manager only) and timecard corrections land on the activity log.
 */

const MNL = "Asia/Manila";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: MNL, hour: "numeric", minute: "2-digit" });
}

/** "HH:MM" in Manila for an ISO instant (for the time inputs). */
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: MNL, hour: "2-digit", minute: "2-digit", hour12: false });
}

function addDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function fmtLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function AttendanceDayPanel({
  day,
  employeeId,
  onChanged,
}: {
  day: AttendanceDay;
  /** Present only in the owner/manager view — enables the fixes. */
  employeeId?: string;
  onChanged?: () => void;
}) {
  const style = STATUS_STYLE[day.status];
  const canEdit = !!employeeId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; errors?: Record<string, string> }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) onChanged?.();
    else setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not save."));
  }

  const mark = (status: "Present" | "Absent" | "Leave", hours = 0) =>
    run(() => saveAttendance({ employeeId: employeeId!, workDate: day.date, status, hours }));

  return (
    <div className="rounded-[12px] bg-paper hairline p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-extrabold tracking-tight">{fmtLongDate(day.date)}</div>
          <div className="text-[12px] text-ink-faint">
            {day.scheduled ? "Scheduled work day" : day.status === "unscheduled" ? "Not scheduled" : "Rest day"}
            {day.restDayWorked ? " · worked on a rest day" : ""}
            {day.manual ? " · set by a manager" : ""}
          </div>
        </div>
        <span className={"inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold " + style.cell}>{style.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="On the clock" value={fmtHours(day.grossMinutes)} />
        <Stat label="Unpaid break" value={day.breakMinutes > 0 ? `−${fmtHours(day.breakMinutes)}` : "None"} />
        <Stat label="Hours worked" value={fmtHours(day.workedMinutes)} strong />
      </div>

      {day.punches.length > 0 ? (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] font-semibold text-ink-faint">
              <th className="py-1">Shift In (Time In)</th>
              <th className="py-1">Shift Out (Time Out)</th>
              <th className="py-1 text-right">Length</th>
            </tr>
          </thead>
          <tbody>
            {day.punches.map((p) => (
              <tr key={p.id} className="border-t border-ink/8">
                <td className="py-2 tabular-nums font-semibold">{fmtTime(p.timeIn)}</td>
                <td className="py-2 tabular-nums font-semibold">
                  {p.open ? (
                    <span className="text-accent-600">On the clock</span>
                  ) : p.needsReview ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <Icon name="warning" className="w-3.5 h-3.5" strokeWidth={1.9} />
                      Missing Shift Out
                    </span>
                  ) : (
                    fmtTime(p.timeOut)
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{p.needsReview ? "—" : fmtHours(p.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[13px] text-ink-soft">No Shift In recorded for this day.</p>
      )}

      {day.note && <p className="text-[12.5px] text-ink-soft">Note: {day.note}</p>}

      {canEdit &&
        day.punches
          .filter((p) => p.needsReview)
          .map((p) => <FixShiftOut key={p.id} punch={p} date={day.date} busy={busy} onSave={run} />)}

      {canEdit && day.status !== "unscheduled" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ink/8">
          <span className="text-[12px] font-semibold text-ink-faint mr-1 pt-2">Mark by hand:</span>
          <MarkButton disabled={busy} onClick={() => void mark("Leave")}>Leave</MarkButton>
          <MarkButton disabled={busy} onClick={() => void mark("Absent")}>Absent</MarkButton>
          <MarkButton disabled={busy} onClick={() => void mark("Present")}>Present (full day)</MarkButton>
          {day.manual && (
            <MarkButton disabled={busy} onClick={() => void run(() => clearAttendance(employeeId!, day.date))}>
              Undo manual entry
            </MarkButton>
          )}
        </div>
      )}

      {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
    </div>
  );
}

/** Enter the real Time Out for a forgotten Shift Out. */
function FixShiftOut({
  punch,
  date,
  busy,
  onSave,
}: {
  punch: PunchView;
  date: string;
  busy: boolean;
  onSave: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [timeIn, setTimeIn] = useState(hhmm(punch.timeIn));
  const [timeOut, setTimeOut] = useState("");
  const [nextDay, setNextDay] = useState(false);

  function save() {
    if (!timeOut) return;
    const clockIn = `${date}T${timeIn}:00+08:00`;
    const clockOut = `${nextDay ? addDay(date) : date}T${timeOut}:00+08:00`;
    void onSave(() => correctTimecard(punch.id, { clockIn, clockOut }));
  }

  return (
    <div className="rounded-[10px] bg-amber-50 px-3.5 py-3 space-y-2.5">
      <div className="text-[13px] font-bold text-amber-700">Fix the missing Shift Out</div>
      <p className="text-[12px] text-amber-700/90">
        This counts as 0 hours until you enter the real Time Out. Payroll for this period can&rsquo;t be approved
        until it&rsquo;s fixed.
      </p>
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="space-y-1">
          <span className="block text-[11.5px] font-semibold text-ink-soft">Time In</span>
          <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className="field-input rounded-[9px] px-2.5 py-1.5 text-[13.5px]" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11.5px] font-semibold text-ink-soft">Time Out</span>
          <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} className="field-input rounded-[9px] px-2.5 py-1.5 text-[13.5px]" />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-[12.5px] text-ink-soft">
          <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          ended the next day
        </label>
        <button
          type="button"
          onClick={save}
          disabled={busy || !timeOut}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-4 py-2 rounded-[9px] shadow-btn disabled:opacity-50"
        >
          Save Time Out
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-[10px] bg-surface hairline px-2 py-2">
      <div className={"tabular-nums " + (strong ? "text-[15px] font-extrabold" : "text-[14px] font-bold")}>{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}

function MarkButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-2 rounded-[9px] bg-surface hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

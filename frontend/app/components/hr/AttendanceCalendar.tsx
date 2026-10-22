"use client";

import type { AttendanceDay, DayStatus } from "@/lib/hr";

/**
 * A month grid of one person's attendance, colour-coded by the DERIVED status
 * (schedule + Shift In/Out + manual entries — see backend hr/attendance.ts):
 *   green = present · red = absent · yellow = half-day · blue = leave ·
 *   grey = rest day / not scheduled / not in yet · amber outline = needs review.
 * Tapping a date selects it so the page can show that day's details. Shared by
 * the employee file (People & Payroll) and the staff self-service portal.
 */
export const STATUS_STYLE: Record<DayStatus, { cell: string; label: string; legend: boolean }> = {
  present: { cell: "bg-accent-500 text-white", label: "Present", legend: true },
  absent: { cell: "bg-rose-500 text-white", label: "Absent", legend: true },
  half_day: { cell: "bg-amber-400 text-white", label: "Half-day", legend: true },
  leave: { cell: "bg-brand-400 text-white", label: "Leave", legend: true },
  rest_day: { cell: "bg-paper hairline text-ink-faint", label: "Rest day / not scheduled", legend: true },
  unscheduled: { cell: "bg-paper hairline text-ink-faint", label: "Not scheduled", legend: false },
  pending: { cell: "bg-paper text-ink-soft border border-dashed border-ink/25", label: "Not in yet", legend: false },
  needs_review: { cell: "bg-paper text-amber-700 ring-2 ring-amber-400", label: "Needs review", legend: true },
};

export function fmtHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function AttendanceCalendar({
  month,
  days,
  selected,
  onSelect,
}: {
  month: string;
  days: AttendanceDay[];
  selected?: string | null;
  onSelect?: (date: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = new Date(y, m - 1, 1).getDay(); // 0 = Sun
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: ({ day: number; date: string } | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: `${month}-${String(d).padStart(2, "0")}` });

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w} className="text-[11px] font-bold text-ink-faint pb-1">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} />;
          const rec = byDate.get(c.date);
          const style = rec ? STATUS_STYLE[rec.status] : STATUS_STYLE.unscheduled;
          const isSel = selected === c.date;
          return (
            <button
              key={c.date}
              type="button"
              onClick={() => onSelect?.(c.date)}
              disabled={!onSelect}
              aria-pressed={isSel}
              aria-label={`${c.date}: ${style.label}${rec && rec.workedMinutes > 0 ? `, ${fmtHours(rec.workedMinutes)}` : ""}`}
              title={`${c.date} · ${style.label}${rec && rec.workedMinutes > 0 ? ` · ${fmtHours(rec.workedMinutes)}` : ""}`}
              className={
                "relative aspect-square rounded-[9px] flex flex-col items-center justify-center text-[12px] transition " +
                style.cell +
                (isSel ? " outline outline-2 outline-offset-2 outline-brand-500" : "") +
                (onSelect ? " cursor-pointer hover:brightness-95" : " cursor-default")
              }
            >
              <span className="font-semibold leading-none">{c.day}</span>
              {rec && rec.workedMinutes > 0 && (
                <span className="text-[9px] opacity-90 leading-none mt-0.5">{fmtHours(rec.workedMinutes)}</span>
              )}
              {rec?.status === "needs_review" && <span className="text-[10px] font-extrabold leading-none mt-0.5">!</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-soft">
        {(Object.keys(STATUS_STYLE) as DayStatus[])
          .filter((k) => STATUS_STYLE[k].legend)
          .map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={"w-3 h-3 rounded-[4px] " + STATUS_STYLE[k].cell} />
              {STATUS_STYLE[k].label}
            </span>
          ))}
      </div>
    </div>
  );
}

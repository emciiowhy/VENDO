"use client";

import type { AttendanceDay } from "@/lib/hr";

/**
 * A month grid of one person's attendance, colour-coded by status, with logged
 * hours shown on worked days. Shared by the HR employee file and the ESS portal.
 */
const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  Present: { bg: "bg-accent-500 text-white", label: "Present" },
  "Half-day": { bg: "bg-amber-400 text-white", label: "Half-day" },
  Leave: { bg: "bg-brand-400 text-white", label: "Leave" },
  Absent: { bg: "bg-rose-500 text-white", label: "Absent" },
};

export function AttendanceCalendar({ month, days }: { month: string; days: AttendanceDay[] }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = first.getDay(); // 0 = Sun
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: ({ day: number; date: string } | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: `${month}-${String(d).padStart(2, "0")}` });
  }

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
          const style = rec ? STATUS_STYLE[rec.status] : null;
          return (
            <div
              key={c.date}
              className={
                "aspect-square rounded-[9px] flex flex-col items-center justify-center text-[12px] " +
                (style ? style.bg : "bg-paper hairline text-ink-faint")
              }
              title={rec ? `${c.date} · ${rec.status}${rec.hours ? ` · ${rec.hours}h` : ""}` : c.date}
            >
              <span className="font-semibold leading-none">{c.day}</span>
              {rec && rec.hours > 0 && <span className="text-[9px] opacity-90 leading-none mt-0.5">{rec.hours}h</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-soft">
        {Object.entries(STATUS_STYLE).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={"w-3 h-3 rounded-[4px] " + v.bg} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}

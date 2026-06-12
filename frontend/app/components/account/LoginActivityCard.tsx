"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { CardSkeleton, SectionCard, describeDevice, methodLabel, relativeTime } from "./ui";
import { getLoginEvents, type LoginEvent } from "@/lib/account";

/**
 * Recent sign-ins — an append-only audit trail so an owner can spot access they
 * don't recognise. Read-only; the live device list (with revoke) lives in the
 * Active sessions card above.
 */
export function LoginActivityCard() {
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getLoginEvents();
      if (!alive) return;
      if (res.ok) setEvents(res.events);
      else setLoadError(res.error ?? "Could not load your sign-in history.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <SectionCard icon="clock" title="Recent sign-ins">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!events) return <CardSkeleton />;

  return (
    <SectionCard
      icon="clock"
      title="Recent sign-ins"
      description="The last 25 times your account was used to sign in."
    >
      {events.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft">No sign-ins recorded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-[10px] px-3 py-2 hover:bg-paper transition duration-150"
            >
              <span className="grid place-items-center w-8 h-8 rounded-[9px] bg-paper hairline text-ink-soft shrink-0">
                <Icon name="clock" className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold tracking-tight truncate">
                  {methodLabel(e.method)} · {describeDevice(e.userAgent)}
                </div>
                <div className="text-[12px] text-ink-faint truncate">{e.ip ?? "unknown IP"}</div>
              </div>
              <span className="text-[12px] text-ink-faint shrink-0">{relativeTime(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

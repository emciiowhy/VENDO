"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { CardSkeleton, SectionCard, describeDevice, methodLabel, relativeTime } from "./ui";
import {
  getSessions,
  revokeOtherSessions,
  revokeSession,
  type DeviceSession,
} from "@/lib/account";

/**
 * Active device sessions — every place this account is signed in, with the
 * current device flagged. Owners can revoke any one device, or sign out
 * everywhere else in a single action (revoked sessions are rejected on their
 * next request by the auth middleware).
 */
export function SessionsCard() {
  const { push } = useToast();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const res = await getSessions();
    if (res.ok) setSessions(res.sessions);
    else setLoadError(res.error ?? "Could not load your active sessions.");
  }

  async function onRevoke(s: DeviceSession) {
    const res = await revokeSession(s.id);
    if (res.ok) {
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? prev);
      push({ variant: "success", title: "Device signed out" });
    } else {
      push({ variant: "danger", title: "Couldn’t sign that device out", message: res.error });
    }
  }

  async function onRevokeOthers() {
    setConfirmAll(false);
    const res = await revokeOtherSessions();
    if (res.ok) {
      setSessions((prev) => prev?.filter((x) => x.current) ?? prev);
      push({
        variant: "success",
        title: res.revoked > 0 ? `Signed out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}` : "No other devices were signed in",
      });
    } else {
      push({ variant: "danger", title: "Couldn’t sign out other devices", message: res.error });
    }
  }

  if (loadError) {
    return (
      <SectionCard icon="monitor" title="Active sessions">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!sessions) return <CardSkeleton />;

  const others = sessions.filter((s) => !s.current);

  return (
    <SectionCard
      icon="monitor"
      title="Active sessions"
      description="Devices where your account is currently signed in."
      footer={
        others.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            className="w-full rounded-[10px] hairline bg-paper hover:bg-rose-50 hover:text-rose-600 py-2.5 text-[13.5px] font-semibold text-ink-soft transition duration-150"
          >
            Sign out all other devices
          </button>
        ) : null
      }
    >
      <ul className="space-y-2.5">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 rounded-[12px] hairline bg-paper px-4 py-3"
          >
            <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft shrink-0">
              <Icon name="monitor" className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-bold tracking-tight truncate">
                  {describeDevice(s.userAgent)}
                </span>
                {s.current && (
                  <span className="text-[10.5px] font-bold bg-accent-50 text-accent-600 rounded-full px-2 py-0.5">
                    This device
                  </span>
                )}
              </div>
              <div className="text-[12px] text-ink-faint truncate">
                {methodLabel(s.method)} · {s.ip ?? "unknown IP"} ·{" "}
                {s.current ? "active now" : `last active ${relativeTime(s.lastSeenAt)}`}
              </div>
            </div>
            {!s.current && (
              <button
                type="button"
                onClick={() => onRevoke(s)}
                className="text-[12.5px] font-semibold text-ink-faint hover:text-rose-600 transition duration-150 shrink-0"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>

      {confirmAll && (
        <ConfirmDialog
          title="Sign out all other devices?"
          message="Every other signed-in device will be logged out immediately. This device stays signed in."
          confirmLabel="Sign out others"
          icon="logout"
          danger
          onCancel={() => setConfirmAll(false)}
          onConfirm={onRevokeOthers}
        />
      )}
    </SectionCard>
  );
}

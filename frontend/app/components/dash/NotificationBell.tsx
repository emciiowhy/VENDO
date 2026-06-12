"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "../Icon";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type Severity,
} from "@/lib/notifications";

/**
 * The shared notification bell — used by both the merchant (/dashboard) and the
 * Super Admin (/admin) shells. It polls the unread count on an interval and
 * fetches the full feed when opened. Clicking a notification marks it read and
 * navigates to its linked route. Persistence lives server-side, so the bell is
 * accurate across reloads and devices.
 */
const POLL_MS = 45_000;

const SEVERITY: Record<Severity, { icon: IconName; chip: string }> = {
  info: { icon: "bell", chip: "bg-brand-50 text-brand-600" },
  success: { icon: "check", chip: "bg-accent-50 text-accent-600" },
  warning: { icon: "box", chip: "bg-amber-50 text-amber-600" },
  danger: { icon: "shield", chip: "bg-rose-50 text-rose-600" },
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    const n = await getUnreadCount();
    if (n !== null) setUnread(n);
  }, []);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    const feed = await getNotifications();
    if (feed) {
      setItems(feed.notifications);
      setUnread(feed.unread);
    }
    setLoading(false);
  }, []);

  // Poll the cheap unread count; the full list loads on open.
  useEffect(() => {
    void refreshCount();
    const timer = setInterval(() => void refreshCount(), POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadFeed();
  }

  async function onItemClick(n: AppNotification) {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationRead(n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function onMarkAll() {
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
    setUnread(0);
    await markAllNotificationsRead();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={toggle}
        className="relative grid place-items-center w-9 h-9 rounded-[10px] hairline bg-surface text-ink-soft hover:text-ink transition duration-150"
      >
        <Icon name="bell" className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[10px] font-bold ring-2 ring-surface">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl2 bg-surface hairline shadow-soft overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 hairline-b">
            <span className="text-[13.5px] font-extrabold tracking-tight">Notifications</span>
            {items.some((n) => !n.readAt) && (
              <button
                type="button"
                onClick={onMarkAll}
                className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-ink-faint">Loading…</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <span className="grid place-items-center w-11 h-11 mx-auto rounded-full bg-paper hairline text-ink-faint">
                  <Icon name="bell" className="w-5 h-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold text-ink-soft">You're all caught up</p>
                <p className="text-[12px] text-ink-faint">New alerts will appear here.</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const sev = SEVERITY[n.severity];
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onItemClick(n)}
                        className={
                          "flex w-full gap-3 px-4 py-3 text-left hairline-b last:border-b-0 transition duration-150 " +
                          (n.readAt ? "hover:bg-paper" : "bg-brand-50/40 hover:bg-brand-50")
                        }
                      >
                        <span className={"grid place-items-center w-8 h-8 rounded-[9px] shrink-0 " + sev.chip}>
                          <Icon name={sev.icon} className="w-4 h-4" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold tracking-tight text-ink leading-snug">
                            {n.title}
                          </span>
                          {n.body && (
                            <span className="block text-[12px] text-ink-soft leading-snug mt-0.5">{n.body}</span>
                          )}
                          <span className="block text-[11px] text-ink-faint mt-1">{relativeTime(n.createdAt)}</span>
                        </span>
                        {!n.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / a date for older. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

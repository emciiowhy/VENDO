import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  listNotifications,
  markAllRead,
  markRead,
  maybeCheckPlatformHealth,
  unreadCount,
} from "./notifications.repository.js";

/**
 * The per-user notification feed, mounted at /api/v1/notifications and open to
 * any authenticated session (every role has a bell). Rows are always scoped to
 * the requesting user — the id comes from the verified session, never the body.
 * On a SUPER_ADMIN poll we opportunistically run a throttled platform-health
 * check so a degraded platform surfaces in the bell without a background worker.
 */
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/** GET / — recent notifications + the current unread count. */
notificationsRouter.get("/", async (req, res) => {
  const user = req.user!;
  if (user.role === "SUPER_ADMIN") void maybeCheckPlatformHealth();
  try {
    const [notifications, unread] = await Promise.all([
      listNotifications(user.userId, 30),
      unreadCount(user.userId),
    ]);
    res.json({ ok: true, notifications, unread });
  } catch (err) {
    console.error("[notifications] list failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your notifications." });
  }
});

/** GET /unread-count — cheap badge poll. */
notificationsRouter.get("/unread-count", async (req, res) => {
  const user = req.user!;
  if (user.role === "SUPER_ADMIN") void maybeCheckPlatformHealth();
  try {
    res.json({ ok: true, unread: await unreadCount(user.userId) });
  } catch (err) {
    console.error("[notifications] unread-count failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your notifications." });
  }
});

/** POST /:id/read — mark one notification read. */
notificationsRouter.post("/:id/read", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ ok: false, error: "Unknown notification." });
  }
  try {
    await markRead(req.user!.userId, id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[notifications] mark read failed:", err);
    res.status(500).json({ ok: false, error: "Could not update that notification." });
  }
});

/** POST /read-all — clear the unread badge. */
notificationsRouter.post("/read-all", async (req, res) => {
  try {
    const cleared = await markAllRead(req.user!.userId);
    res.json({ ok: true, cleared });
  } catch (err) {
    console.error("[notifications] read-all failed:", err);
    res.status(500).json({ ok: false, error: "Could not update your notifications." });
  }
});

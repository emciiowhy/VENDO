import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { clockIn, clockOut, getClockStatus, getMyTimecards } from "./timecard.repository.js";

/**
 * Shift clock engine — POST /clock-in, POST /clock-out, GET /status, GET /me.
 * Mounted at /api/v1/merchant/shifts.
 *
 * Unlike the HR admin router (owner/manager only), the clock is for EVERYONE on
 * the floor — cashiers included — so they can log their own hours without
 * reaching any back-office screen. Scope is taken EXCLUSIVELY from the verified
 * session (`req.user.tenantId` + `req.user.userId`); nothing here trusts a tenant
 * or user id from the request body or params, so a worker can only ever punch
 * their own clock, within their own tenant.
 */
export const timecardRouter = Router();

timecardRouter.use(requireRole("CASHIER", "MANAGER", "MERCHANT_OWNER"));

function scope(req: Request): { tenantId: string; userId: string } | null {
  const tenantId = req.user?.tenantId ?? null;
  const userId = req.user?.userId ?? null;
  if (!tenantId || !userId) return null;
  return { tenantId, userId };
}

function noScope(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

/** GET /status — the caller's current clock state + minutes worked today. */
timecardRouter.get("/status", async (req, res) => {
  const s = scope(req);
  if (!s) return noScope(res);
  try {
    res.json({ ok: true, ...(await getClockStatus(s.tenantId, s.userId)) });
  } catch (err) {
    console.error("[timecard] status failed:", err);
    res.status(500).json({ ok: false, error: "Could not read your clock status." });
  }
});

/** POST /clock-in — open a timecard. 409 if already on the clock. */
timecardRouter.post("/clock-in", async (req, res) => {
  const s = scope(req);
  if (!s) return noScope(res);
  try {
    const result = await clockIn(s.tenantId, s.userId);
    if (!result.ok) {
      return res.status(409).json({ ok: false, error: "You're already clocked in.", timecard: result.timecard });
    }
    res.status(201).json({ ok: true, timecard: result.timecard });
  } catch (err) {
    console.error("[timecard] clock-in failed:", err);
    res.status(500).json({ ok: false, error: "Could not clock you in." });
  }
});

/** POST /clock-out — close the caller's open timecard. 409 if not clocked in. */
timecardRouter.post("/clock-out", async (req, res) => {
  const s = scope(req);
  if (!s) return noScope(res);
  try {
    const result = await clockOut(s.tenantId, s.userId);
    if (!result.ok) {
      return res.status(409).json({ ok: false, error: "You're not clocked in." });
    }
    res.json({ ok: true, timecard: result.timecard });
  } catch (err) {
    console.error("[timecard] clock-out failed:", err);
    res.status(500).json({ ok: false, error: "Could not clock you out." });
  }
});

/** GET /me — the caller's own clock history + rolling week/month totals. */
timecardRouter.get("/me", async (req, res) => {
  const s = scope(req);
  if (!s) return noScope(res);
  try {
    res.json({ ok: true, ...(await getMyTimecards(s.tenantId, s.userId)) });
  } catch (err) {
    console.error("[timecard] my timecards failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your shift records." });
  }
});

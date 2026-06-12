import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { getActivitySince, getVarianceAlertsSince, sampleServerMetrics } from "./health.repository.js";

/**
 * Real-time System Health telemetry, mounted at /api/v1/admin/health and fenced
 * to SUPER_ADMIN. The browser opens an EventSource against `/stream`; we hold
 * the connection open and push two kinds of Server-Sent Events on a short
 * interval:
 *
 *   event: metrics   → { pool occupancy, query latency }   (every tick)
 *   event: activity  → one cross-tenant operational event  (as they happen)
 *
 * SSE (not WebSockets) keeps it a plain HTTP GET — it rides the existing CORS +
 * cookie auth with no extra protocol, and reconnects for free on the client.
 */
export const adminHealthRouter = Router();

/** How often we sample metrics and drain new activity (ms). */
const TICK_MS = 3_000;

adminHealthRouter.get("/stream", requireRole("SUPER_ADMIN"), async (req: Request, res: Response) => {
  // SSE handshake. CORP is relaxed like the uploads host so the cross-origin
  // (3000 → 4000) EventSource isn't blocked by helmet's same-origin default.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  res.write("retry: 4000\n\n");

  let alive = true;
  // High-water mark: only emit events strictly newer than this. Seeded a minute
  // back so a freshly-opened dashboard shows a little recent context, then only
  // genuinely new events stream in.
  let highWater = new Date(Date.now() - 60_000);
  // Variance flags are seeded from connect time so only Z-Reads committed while
  // watching raise a fresh security flag.
  let alertHighWater = new Date();

  const send = (event: string, data: unknown) => {
    if (!alive) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  async function tick() {
    if (!alive) return;
    try {
      send("metrics", await sampleServerMetrics());
      const events = await getActivitySince(highWater);
      for (const ev of events) {
        send("activity", ev);
        const at = new Date(ev.at);
        if (at > highWater) highWater = at;
      }
      const alerts = await getVarianceAlertsSince(alertHighWater);
      for (const al of alerts) {
        send("alert", al);
        const at = new Date(al.at);
        if (at > alertHighWater) alertHighWater = at;
      }
    } catch (err) {
      console.error("[admin/health] stream tick failed:", err);
    }
  }

  // Prime immediately, then on the interval. A comment line every tick doubles
  // as a keep-alive heartbeat through proxies.
  await tick();
  const timer = setInterval(() => {
    res.write(": keep-alive\n\n");
    void tick();
  }, TICK_MS);

  req.on("close", () => {
    alive = false;
    clearInterval(timer);
    res.end();
  });
});

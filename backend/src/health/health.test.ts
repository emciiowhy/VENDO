import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  detectConditionEvents,
  INITIAL_CONDITION_STATE,
  type ServerMetrics,
} from "./health.repository.js";

const app = createApp();

describe("System Health stream is SUPER_ADMIN-only", () => {
  it("blocks an unauthenticated EventSource handshake with 401", async () => {
    const res = await request(app).get("/api/v1/admin/health/stream");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

/** Build a metrics sample with just the fields the condition logic reads. */
function metrics(over: { active?: number; waiting?: number; latencyMs?: number }): ServerMetrics {
  return {
    at: new Date().toISOString(),
    pool: { total: 5, idle: 0, active: over.active ?? 1, waiting: over.waiting ?? 0, max: 5 },
    latencyMs: over.latencyMs ?? 50,
  };
}

describe("detectConditionEvents emits on transition only", () => {
  it("stays silent while healthy", () => {
    const { events, state } = detectConditionEvents(metrics({}), INITIAL_CONDITION_STATE);
    expect(events).toHaveLength(0);
    expect(state).toEqual({ poolSaturated: false, latencyHigh: false });
  });

  it("raises a danger line the tick the pool saturates, then goes quiet", () => {
    const first = detectConditionEvents(metrics({ active: 5 }), INITIAL_CONDITION_STATE);
    expect(first.events).toHaveLength(1);
    expect(first.events[0].kind).toBe("health");
    expect(first.events[0].severity).toBe("danger");
    expect(first.state.poolSaturated).toBe(true);

    // Still saturated next tick → no duplicate line.
    const second = detectConditionEvents(metrics({ active: 5 }), first.state);
    expect(second.events).toHaveLength(0);
  });

  it("emits a success 'recovered' line when the pool clears", () => {
    const saturated = { poolSaturated: true, latencyHigh: false };
    const { events } = detectConditionEvents(metrics({ active: 1 }), saturated);
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe("success");
  });

  it("flags high latency as a warning on crossing the threshold", () => {
    const { events, state } = detectConditionEvents(metrics({ latencyMs: 900 }), INITIAL_CONDITION_STATE);
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe("warning");
    expect(state.latencyHigh).toBe(true);
  });
});

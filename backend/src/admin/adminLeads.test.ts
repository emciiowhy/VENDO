import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { provisionSchema, slugify } from "./adminLeads.schema.js";

const app = createApp();

describe("Admin leads pipeline is fenced to SUPER_ADMIN", () => {
  it("blocks unauthenticated pipeline reads with 401", async () => {
    const res = await request(app).get("/api/v1/admin/leads");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("blocks unauthenticated approvals with 401", async () => {
    const res = await request(app)
      .post("/api/v1/admin/leads/00000000-0000-0000-0000-000000000000/approve")
      .send({ storeName: "X", slug: "x", plan: "starter", ownerEmail: "a@b.co", ownerName: "A" });
    expect(res.status).toBe(401);
  });
});

describe("slugify forces a URL-safe, hyphenated lowercase slug", () => {
  it("turns a business name into a clean slug", () => {
    expect(slugify("Kape ni Juan")).toBe("kape-ni-juan");
    expect(slugify("  Aling Nena's Sari-Sari!! ")).toBe("aling-nena-s-sari-sari");
    expect(slugify("ABC   123")).toBe("abc-123");
  });
});

describe("provisioning payload validation", () => {
  const valid = {
    storeName: "Kape ni Juan",
    slug: "kape-ni-juan",
    plan: "business",
    ownerEmail: "owner@kapenijuan.ph",
    ownerName: "Juan dela Cruz",
  };

  it("accepts a well-formed payload", () => {
    expect(provisionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a slug with spaces or uppercase", () => {
    expect(provisionSchema.safeParse({ ...valid, slug: "Kape ni Juan" }).success).toBe(false);
  });

  it("rejects an unknown plan", () => {
    expect(provisionSchema.safeParse({ ...valid, plan: "PLATINUM" }).success).toBe(false);
  });

  it("rejects a malformed owner email", () => {
    expect(provisionSchema.safeParse({ ...valid, ownerEmail: "nope" }).success).toBe(false);
  });
});

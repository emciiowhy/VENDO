import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { renderEnterpriseLeadAlertEmail } from "./enterpriseLeadEmail.js";

const app = createApp();

describe("renderEnterpriseLeadAlertEmail", () => {
  it("carries the operational details a rep needs to scope the rollout", () => {
    const mail = renderEnterpriseLeadAlertEmail({
      contactName: "Maria Santos",
      businessName: "Santos Group",
      email: "maria@santos.ph",
      phone: "0917 000 1111",
      locations: "8 branches",
      currentSystem: "Loyverse + spreadsheets",
      notes: "Need BIR-ready receipts across all sites.",
    });
    expect(mail.subject).toContain("Santos Group");
    expect(mail.text).toContain("maria@santos.ph");
    expect(mail.text).toContain("8 branches");
    expect(mail.text).toContain("Loyverse + spreadsheets");
    expect(mail.html).toContain("Santos Group");
  });

  it("renders gracefully when the optional fields are absent", () => {
    const mail = renderEnterpriseLeadAlertEmail({
      contactName: "Jose Cruz",
      businessName: "Cruz Mart",
      email: "jose@cruzmart.ph",
      phone: "0917 222 3333",
      locations: "2 stores",
      currentSystem: null,
      notes: null,
    });
    expect(mail.text).toContain("Current system: —");
    expect(mail.text).toContain("Notes: —");
  });
});

describe("POST /api/leads/enterprise validation", () => {
  it("rejects an empty payload with 400 + field errors (no DB write)", async () => {
    const res = await request(app).post("/api/leads/enterprise").send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.errors).toBeTruthy();
    // The Enterprise-specific operational field is required.
    expect(res.body.errors.locations).toBeTruthy();
  });

  it("rejects a missing 'locations' field specifically", async () => {
    const res = await request(app).post("/api/leads/enterprise").send({
      name: "Maria Santos",
      businessName: "Santos Group",
      email: "maria@santos.ph",
      phone: "0917 000 1111",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.locations).toBeTruthy();
  });
});

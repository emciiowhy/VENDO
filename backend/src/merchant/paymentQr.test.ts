import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { QR_METHODS, isQrMethod } from "./paymentQr.repository.js";

const app = createApp();

describe("Checkout QR codes are store-staff only", () => {
  it("blocks listing QR codes unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/merchant/payment-qrs");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("blocks uploading a QR code unauthenticated with 401", async () => {
    const res = await request(app).post("/api/v1/merchant/payment-qrs/GCash");
    expect(res.status).toBe(401);
  });

  it("blocks deleting a QR code unauthenticated with 401", async () => {
    const res = await request(app).delete("/api/v1/merchant/payment-qrs/Maya");
    expect(res.status).toBe(401);
  });
});

describe("QR method guard", () => {
  it("recognises only the three e-wallet rails", () => {
    expect(QR_METHODS).toEqual(["GCash", "Maya", "QRPH"]);
    expect(isQrMethod("GCash")).toBe(true);
    expect(isQrMethod("QRPH")).toBe(true);
    expect(isQrMethod("Cash")).toBe(false);
    expect(isQrMethod("paypal")).toBe(false);
  });
});

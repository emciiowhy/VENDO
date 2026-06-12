import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { uploadPaymentQr } from "./paymentQr.upload.js";
import { putPaymentQr, removePaymentQr } from "./paymentQr.storage.js";
import {
  deletePaymentQr,
  getPaymentQrMap,
  getPaymentQrUrl,
  isQrMethod,
  upsertPaymentQr,
} from "./paymentQr.repository.js";

/**
 * Owner-managed e-wallet checkout QR codes, mounted at
 * /api/v1/merchant/payment-qrs. Store staff (MERCHANT_OWNER / MANAGER) upload
 * the real GCash / Maya / QRPH "scan to pay" images that the POS shows to
 * customers. Tenant scope comes only from the verified session.
 */
export const paymentQrRouter = Router();

paymentQrRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}
function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

/** GET /api/v1/merchant/payment-qrs — the tenant's method→URL map. */
paymentQrRouter.get("/", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, qrs: await getPaymentQrMap(tenantId) });
  } catch (err) {
    console.error("[payment-qr] list failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your checkout QR codes." });
  }
});

/** POST /api/v1/merchant/payment-qrs/:method — upload/replace one rail's QR. */
paymentQrRouter.post("/:method", uploadPaymentQr, async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const method = req.params.method;
  if (!isQrMethod(method)) {
    return res.status(400).json({ ok: false, error: "Unknown payment method." });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "Choose a QR image to upload." });
  }
  try {
    const previous = await getPaymentQrUrl(tenantId, method);
    const imageUrl = await putPaymentQr(req.file.buffer, req.file.mimetype);
    await upsertPaymentQr(tenantId, method, imageUrl);
    // Drop the superseded image once the row points at the new one.
    if (previous && previous !== imageUrl) void removePaymentQr(previous);
    res.status(201).json({ ok: true, method, imageUrl });
  } catch (err) {
    console.error("[payment-qr] upload failed:", err);
    res.status(500).json({ ok: false, error: "Could not save the QR code." });
  }
});

/** DELETE /api/v1/merchant/payment-qrs/:method — remove one rail's QR. */
paymentQrRouter.delete("/:method", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const method = req.params.method;
  if (!isQrMethod(method)) {
    return res.status(400).json({ ok: false, error: "Unknown payment method." });
  }
  try {
    const removed = await deletePaymentQr(tenantId, method);
    if (removed) void removePaymentQr(removed);
    res.json({ ok: true, method });
  } catch (err) {
    console.error("[payment-qr] delete failed:", err);
    res.status(500).json({ ok: false, error: "Could not remove the QR code." });
  }
});

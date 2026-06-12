import type { Request, Response, NextFunction } from "express";
import multer from "multer";

/**
 * Multipart interceptor for a single QR image field, `qr`. Same shape as the
 * product-image uploader: in-memory buffer, images only, 2 MB cap, multer
 * errors normalised to the API's `{ ok:false, error }` 400 contract.
 */
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("ONLY_IMAGES"));
  },
}).single("qr");

/** Express middleware: run the upload, normalising failures to 400 JSON. */
export function uploadPaymentQr(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ ok: false, error: "QR image must be 2MB or smaller." });
      }
      return res.status(400).json({ ok: false, error: "Could not read the uploaded image." });
    }
    if (err instanceof Error && err.message === "ONLY_IMAGES") {
      return res.status(400).json({ ok: false, error: "Only image files are allowed." });
    }
    return res.status(400).json({ ok: false, error: "QR upload failed." });
  });
}

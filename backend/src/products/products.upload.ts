import type { Request, Response, NextFunction } from "express";
import multer from "multer";

/**
 * Multipart interceptor for the single optional product image field, `image`.
 *
 * Buffers are held in memory (never written to a temp path) so the storage
 * layer can stream them straight to the object store. Enforced limits:
 *   • images only (`image/*`)
 *   • 10 MB hard cap (room for photos taken straight from a phone camera)
 * The raw multer instance throws on violations; the wrapper below converts
 * those into the same `{ ok:false, error }` 400 shape the rest of the API uses.
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("ONLY_IMAGES"));
    }
  },
}).single("image");

/** Express middleware: run the upload, normalising failures to 400 JSON. */
export function uploadProductImage(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ ok: false, error: "Image must be under 10MB" });
      }
      return res.status(400).json({ ok: false, error: "Could not read the uploaded image." });
    }
    if (err instanceof Error && err.message === "ONLY_IMAGES") {
      return res.status(400).json({ ok: false, error: "Only image files are allowed." });
    }
    return res.status(400).json({ ok: false, error: "Image upload failed." });
  });
}

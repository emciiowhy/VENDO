import { rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { query } from "../db.js";

/**
 * Durable storage for uploaded images (product photos, payment QRs, store
 * logos, avatars).
 *
 * Bytes live in Postgres (`media_objects`) rather than on the instance disk:
 * the Render free tier wipes its disk on every restart/deploy/idle spin-down,
 * which silently 404'd every upload. Images are capped at 2 MB by the upload
 * middleware, so the table stays small. Public URLs keep the historical shape
 * `${PUBLIC_BASE_URL}/uploads/<prefix>/<uuid>.<ext>`, so stored rows, the
 * frontend, and the legacy disk fallback in app.ts all keep working.
 */
export const UPLOADS_ROOT = env.uploadsDir || join(process.cwd(), "uploads");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Persist an approved image buffer under `<prefix>/` and return its public URL. */
export async function putMedia(prefix: string, buffer: Buffer, contentType: string): Promise<string> {
  const mime = contentType.toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error("Unsupported image type.");
  const path = `${prefix}/${randomUUID()}.${ext}`;

  await query(
    `INSERT INTO media_objects (path, content_type, bytes, size_bytes) VALUES ($1, $2, $3, $4)`,
    [path, mime, buffer, buffer.length],
  );

  return `${env.publicBaseUrl}/uploads/${path}`;
}

/**
 * Best-effort removal of an image we stored under `<prefix>/` (replace/delete).
 * No-op for URLs we don't own. Also clears any legacy on-disk copy.
 */
export async function removeMedia(prefix: string, url: string | null | undefined): Promise<void> {
  if (!url) return;
  const base = `${env.publicBaseUrl}/uploads/${prefix}/`;
  if (!url.startsWith(base)) return;
  const key = url.slice(base.length);
  if (!key || key.includes("/") || key.includes("..")) return; // guard traversal
  const path = `${prefix}/${key}`;

  await query(`DELETE FROM media_objects WHERE path = $1`, [path]).catch(() => {});
  await rm(join(UPLOADS_ROOT, prefix, key), { force: true }).catch(() => {});
}

/**
 * Express handler mounted at /uploads: serve a stored image from Postgres, or
 * fall through (to the legacy static-disk handler, then 404) when absent.
 */
export async function serveMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const path = decodeURIComponent(req.path).replace(/^\/+/, "");
  if (!path || path.includes("..")) return next();

  try {
    const { rows } = await query<{ content_type: string; bytes: Buffer }>(
      `SELECT content_type, bytes FROM media_objects WHERE path = $1`,
      [path],
    );
    const row = rows[0];
    if (!row) return next();

    res.setHeader("Content-Type", row.content_type);
    // Keys are random UUIDs and never rewritten, so the bytes are immutable.
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    // helmet defaults CORP to same-origin; the frontend renders these cross-origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // Uploaded SVGs must never run script if opened directly on the API origin.
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.end(req.method === "HEAD" ? undefined : row.bytes);
  } catch (err) {
    next(err);
  }
}

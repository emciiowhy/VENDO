/**
 * Downscale a picked photo in the browser before upload.
 *
 * Phone camera photos are routinely 3–10 MB — over the API's 2 MB image cap
 * (and Vercel's proxy body limit) — so they'd fail on upload. Logos and
 * avatars render at a few dozen pixels, so re-encoding to at most `maxSide`
 * pixels keeps them crisp at a fraction of the size. Vector/animated formats
 * (SVG, GIF) and anything the browser can't decode are passed through as-is.
 */
export async function shrinkImage(file: File, maxSide = 1024, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || /svg|gif/i.test(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // undecodable here (e.g. HEIC on desktop) — let the server judge it
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // PNG keeps transparency for logos; everything else becomes JPEG.
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob || (blob.size >= file.size && scale === 1)) return file;

  const ext = type === "image/png" ? "png" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${name}.${ext}`, { type });
}

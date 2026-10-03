"use client";

import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

/**
 * Plain <img> for user-uploaded media (logos, avatars) that renders `fallback`
 * — the monogram/initials chip — when there's no URL or the image fails to
 * load, instead of the browser's broken-image icon. Uploads are cross-origin
 * API URLs, so a plain <img> sidesteps next/image remote config.
 */
export function FallbackImg({
  src,
  fallback,
  alt,
  ...img
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  fallback: ReactNode;
  alt: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...img} src={src} alt={alt} onError={() => setFailed(src)} />;
}

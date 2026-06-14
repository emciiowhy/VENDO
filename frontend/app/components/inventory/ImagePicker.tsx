"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { resolveAssetUrl } from "@/lib/images";

/**
 * The Vendo Preview Frame + activation control.
 *
 * Shows an instant local preview of a freshly picked file via a temporary blob
 * URL (revoked on change to avoid leaks); otherwise the product's existing
 * hosted image; otherwise a clean monochrome line-art fallback paired with the
 * item's initials. The raw file browser is hidden behind a tactile button.
 */
export function ImagePicker({
  name,
  existingUrl,
  file,
  onPick,
  onRemove,
  maxBytes = 2 * 1024 * 1024,
}: {
  name: string;
  existingUrl: string | null;
  file: File | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  /** Client-side size cap, in bytes. Mirrors the per-route backend limit so
   *  oversized picks are rejected before a wasted upload round-trip. */
  maxBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  // Inline "too large" message; cleared on a valid pick.
  const [sizeError, setSizeError] = useState<string | null>(null);

  // Instant local preview for a freshly picked file; revoked on change/unmount.
  const blobUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!blobUrl) return;
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const [failed, setFailed] = useState(false);
  // Fresh blob picks never fail; a stored URL might 404 → fall back to the icon.
  const preview = blobUrl ?? (failed ? null : resolveAssetUrl(existingUrl));
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—";

  return (
    <div className="flex items-center gap-4">
      {/* Preview frame */}
      <div className="w-24 h-24 shrink-0 rounded-lg hairline bg-paper overflow-hidden grid place-items-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={name || "Product image"}
            className="w-full h-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-ink-faint">
            <Icon name="image" className="w-7 h-7" strokeWidth={1.5} />
            <span className="text-[13px] font-bold tracking-tight text-ink-soft">{initials}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (!f) return;
            if (f.size > maxBytes) {
              setSizeError(`Image must be under ${maxMb}MB`);
              return;
            }
            setSizeError(null);
            onPick(f);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 bg-brand-50 text-brand-600 hover:bg-brand-100 font-medium px-4 py-2.5 rounded-[10px] text-sm transition duration-150 ease-in-out"
        >
          <Icon name="upload" className="w-4 h-4" strokeWidth={1.7} />
          {preview ? "Change image" : "Upload image"}
        </button>
        {preview && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-2 text-[13px] font-semibold text-ink-faint hover:text-rose-600 transition duration-150"
          >
            Remove
          </button>
        )}
        <p className="mt-2 text-[12px] text-ink-faint">PNG, JPG or WEBP · up to {maxMb}MB</p>
        {sizeError && (
          <p className="mt-1 text-[12px] font-semibold text-rose-600">{sizeError}</p>
        )}
      </div>
    </div>
  );
}

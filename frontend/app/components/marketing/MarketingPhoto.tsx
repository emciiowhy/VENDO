"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/app/components/Icon";

/**
 * A real photograph for the marketing pages, with a branded graceful fallback.
 *
 * The site historically used CSS "app mockups" so it never depended on remote
 * assets. We now want real photography (per the StoreHub-style references), but
 * a 404 on a stock URL must never leave a broken-image icon on a sales page.
 * So this component renders an <img>; if it fails to load (or no src is given)
 * it swaps to an on-brand gradient panel with the section's icon — the exact
 * look the rest of the site already uses — so the layout always reads as
 * intentional. Swap any URL in `lib/marketingMedia.ts` for your own asset.
 */
export interface MarketingPhotoProps {
  src?: string | null;
  alt: string;
  /** Icon shown in the fallback panel. */
  icon: IconName;
  /** Aspect ratio utility, e.g. "aspect-[16/10]". */
  aspect?: string;
  className?: string;
  /** Rounded corners utility. */
  rounded?: string;
  priority?: boolean;
}

export function MarketingPhoto({
  src,
  alt,
  icon,
  aspect = "aspect-[16/10]",
  className = "",
  rounded = "rounded-2xl",
  priority = false,
}: MarketingPhotoProps) {
  const [failed, setFailed] = useState(false);
  const showPhoto = src && !failed;

  return (
    <div
      className={`relative ${aspect} ${rounded} overflow-hidden bg-surface hairline ${className}`}
    >
      {showPhoto ? (
        // Plain <img> on purpose: these are remote stock/placeholder URLs and we
        // want the onError → gradient fallback without configuring next/image
        // remotePatterns for every host. Swap for next/image once assets are local.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand-100 to-brand-50">
          <Icon name={icon} className="w-14 h-14 text-brand-600/80" strokeWidth={1.3} />
        </div>
      )}
    </div>
  );
}

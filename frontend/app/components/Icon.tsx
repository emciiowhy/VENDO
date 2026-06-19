import type { SVGProps } from "react";

export type IconName =
  | "pos"
  | "box"
  | "truck"
  | "factory"
  | "chart"
  | "users"
  | "heart"
  | "receipt"
  | "card"
  | "wifi-off"
  | "shield"
  | "check"
  | "arrow"
  | "plus"
  | "layers"
  // dashboard / admin / pos
  | "store"
  | "building"
  | "gear"
  | "search"
  | "logout"
  | "bell"
  | "dots"
  | "chevron"
  | "refresh"
  | "lock"
  | "eye"
  | "eye-off"
  | "ban"
  | "file"
  | "wallet"
  | "trash"
  | "x"
  | "menu"
  | "activity"
  | "database"
  | "clock"
  | "tag"
  | "home"
  | "cart"
  | "peso"
  | "bolt"
  | "grid"
  // inventory
  | "image"
  | "upload"
  | "pencil"
  | "filter"
  | "sun"
  | "moon"
  | "download"
  | "trend"
  | "pulse"
  | "monitor";

/**
 * Renders one monochromatic line icon by referencing the sprite defined in
 * <IconSprite />. Inherits color via `currentColor` and stroke styling.
 */
export function Icon({
  name,
  className,
  ...props
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}

/**
 * The icon sprite. Render once near the top of the page; <Icon /> instances
 * reference these symbols by id.
 */
export function IconSprite() {
  return (
    <svg width={0} height={0} className="hidden" aria-hidden="true">
      <defs>
        <g id="i-pos">
          <path d="M3 5h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
          <path d="M8 20h8M12 16v4" />
        </g>
        <g id="i-box">
          <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
          <path d="M4 7l8 4 8-4M12 11v10" />
        </g>
        <g id="i-truck">
          <path d="M2 6.5h11v9H2zM13 9.5h4l4 3.5v2.5h-8" />
          <circle cx="6" cy="18" r="1.6" />
          <circle cx="17.5" cy="18" r="1.6" />
        </g>
        <g id="i-factory">
          <path d="M3 21V10l5 3v-3l5 3V8l4 2v11H3Z" />
          <path d="M3 21h18" />
        </g>
        <g id="i-chart">
          <path d="M4 4v16h16" />
          <path d="M8 16v-4M12 16V8M16 16v-6" />
        </g>
        <g id="i-users">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" />
          <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M17 14.4a6.5 6.5 0 0 1 4.5 5.1" />
        </g>
        <g id="i-heart">
          <path d="M12 20.5 4.2 13a4.6 4.6 0 0 1 6.5-6.5l1.3 1.3 1.3-1.3A4.6 4.6 0 0 1 19.8 13L12 20.5Z" />
        </g>
        <g id="i-receipt">
          <path d="M6 3v18l2-1.2L10 21l2-1.2L14 21l2-1.2L18 21V3l-2 1.2L14 3l-2 1.2L10 3 8 4.2 6 3Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </g>
        <g id="i-card">
          <rect x="2.5" y="5" width="19" height="14" rx="2" />
          <path d="M2.5 9.5h19M6 15h4" />
        </g>
        <g id="i-wifi-off">
          <path d="M2 2l20 20" />
          <path d="M8.6 16.1a5 5 0 0 1 6.8 0M5 12.6a10 10 0 0 1 3.2-2.1M15.8 10.5a10 10 0 0 1 3.2 2.1M2 8.8a15.5 15.5 0 0 1 5.5-3.2M11.2 4.3a15.5 15.5 0 0 1 10.8 4.5" />
          <path d="M12 20h.01" />
        </g>
        <g id="i-shield">
          <path d="M12 3 5 5.8v5.4c0 4.2 3 7.3 7 8.3 4-1 7-4.1 7-8.3V5.8L12 3Z" />
          <path d="M9.2 11.8 11.2 14l3.6-4" />
        </g>
        <g id="i-check">
          <path d="M20 6 9 17l-5-5" />
        </g>
        <g id="i-arrow">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </g>
        <g id="i-plus">
          <path d="M12 5v14M5 12h14" />
        </g>
        <g id="i-layers">
          <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
          <path d="M3 12l9 4.5L21 12M3 16.5 12 21l9-4.5" />
        </g>
        <g id="i-store">
          <path d="M4 9.5V20h16V9.5M3 4h18l1 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0l1-5Z" />
          <path d="M9.5 20v-5h5v5" />
        </g>
        <g id="i-building">
          <path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 21V9h3a1 1 0 0 1 1 1v11M3 21h18" />
          <path d="M8 7h3M8 11h3M8 15h3" />
        </g>
        <g id="i-gear">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 13a7.8 7.8 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.8 7.8 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z" />
        </g>
        <g id="i-search">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </g>
        <g id="i-logout">
          <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
          <path d="M16 8l4 4-4 4M20 12H9" />
        </g>
        <g id="i-bell">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Z" />
          <path d="M10.3 21a2 2 0 0 0 3.4 0" />
        </g>
        <g id="i-dots">
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </g>
        <g id="i-chevron">
          <path d="m6 9 6 6 6-6" />
        </g>
        <g id="i-refresh">
          <path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 5v4h4" />
          <path d="M4 13a8 8 0 0 0 14 4.5l2-2.5M20 19v-4h-4" />
        </g>
        <g id="i-lock">
          <rect x="4.5" y="11" width="15" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </g>
        <g id="i-eye">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </g>
        <g id="i-eye-off">
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.16 4.06M6.5 6.6A18.4 18.4 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.17-.83" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </g>
        <g id="i-ban">
          <circle cx="12" cy="12" r="9" />
          <path d="m5.6 5.6 12.8 12.8" />
        </g>
        <g id="i-file">
          <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
          <path d="M14 3v4h4M9 12h6M9 16h6" />
        </g>
        <g id="i-wallet">
          <path d="M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h16a1 1 0 0 1 1 1v3" />
          <circle cx="17" cy="12.5" r="1.2" />
        </g>
        <g id="i-trash">
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
          <path d="M10 11v6M14 11v6" />
        </g>
        <g id="i-x">
          <path d="M6 6l12 12M18 6 6 18" />
        </g>
        <g id="i-menu">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </g>
        <g id="i-activity">
          <path d="M3 12h4l3 8 4-16 3 8h4" />
        </g>
        <g id="i-database">
          <ellipse cx="12" cy="5.5" rx="8" ry="3" />
          <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </g>
        <g id="i-clock">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </g>
        <g id="i-tag">
          <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
          <circle cx="7.5" cy="7.5" r="1.3" />
        </g>
        <g id="i-home">
          <path d="M3 11 12 3l9 8" />
          <path d="M5 9.5V20h14V9.5" />
        </g>
        <g id="i-cart">
          <path d="M3 4h2l2.5 12.5a1 1 0 0 0 1 .8h8.5a1 1 0 0 0 1-.8L21 8H6" />
          <circle cx="9.5" cy="20" r="1.3" />
          <circle cx="17" cy="20" r="1.3" />
        </g>
        <g id="i-peso">
          <path d="M7 21V4h5a5 5 0 0 1 0 10H7M4 8.5h11M4 12h11" />
        </g>
        <g id="i-bolt">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </g>
        <g id="i-grid">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </g>
        <g id="i-image">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="M21 15.5 16 11 5 20" />
        </g>
        <g id="i-upload">
          <path d="M12 15V4M8 8l4-4 4 4" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </g>
        <g id="i-pencil">
          <path d="M4 20h4L19.5 8.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" />
          <path d="M13.5 6.5l4 4" />
        </g>
        <g id="i-filter">
          <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />
        </g>
        <g id="i-sun">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </g>
        <g id="i-moon">
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
        </g>
        <g id="i-download">
          <path d="M12 4v11M8 11l4 4 4-4" />
          <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
        </g>
        <g id="i-trend">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M16 7h5v5" />
        </g>
        <g id="i-pulse">
          <path d="M3 12h3.5l2-6 4 14 2.5-8H21" />
        </g>
        <g id="i-monitor">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </g>
      </defs>
    </svg>
  );
}

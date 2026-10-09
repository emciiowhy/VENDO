"use client";

import { Icon } from "../Icon";
import { useTheme } from "./ThemeProvider";

/**
 * Light/Dark switch. Two renderings share one handler:
 *   • Mobile (< sm): a compact 44px icon button that matches the notification
 *     bell, so the header reads as a row of equal, thumb-sized controls.
 *   • Desktop (≥ sm): the animated sliding pill — knob slides, sun/moon
 *     cross-fade — where there's room for the richer affordance.
 * Both are touch-feedback'd (`.press`) and correct in light + dark.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  const title = dark ? "Light mode" : "Dark mode";

  return (
    <>
      {/* Mobile: compact icon button, sized/shaped like the other header controls. */}
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={dark}
        aria-label={label}
        title={title}
        className={
          "press tap sm:hidden shrink-0 grid place-items-center w-11 h-11 rounded-[12px] hairline bg-surface " +
          "text-ink-soft hover:text-ink active:text-ink transition-colors duration-150 " +
          className
        }
      >
        <Icon
          name={dark ? "moon" : "sun"}
          className={"w-[19px] h-[19px] " + (dark ? "text-brand-400" : "text-amber-500")}
          strokeWidth={1.8}
        />
      </button>

      {/* Desktop: the animated sliding pill. */}
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={dark}
        aria-label={label}
        title={title}
        className={
          "press hidden sm:inline-flex relative shrink-0 items-center w-[58px] h-9 rounded-full hairline bg-paper " +
          "transition-colors duration-200 ease-in-out " +
          className
        }
      >
        {/* sliding knob — elevated fill + a hairline edge so it reads as a
            distinct knob even in dark mode, where bg-surface and bg-paper are
            near-identical near-blacks and shadow-card is invisible. */}
        <span
          className={
            "absolute top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-full " +
            "bg-surface dark:bg-surface-2 shadow-card ring-1 ring-black/5 dark:ring-white/10 " +
            "transition-transform duration-200 ease-in-out " +
            (dark ? "translate-x-[26px]" : "translate-x-[3px]")
          }
        >
          <Icon
            name={dark ? "moon" : "sun"}
            className={dark ? "w-[15px] h-[15px] text-brand-400" : "w-[15px] h-[15px] text-amber-500"}
            strokeWidth={1.8}
          />
        </span>
        {/* track icons */}
        <Icon name="sun" className="absolute left-[9px] w-[14px] h-[14px] text-ink-faint" strokeWidth={1.7} />
        <Icon name="moon" className="absolute right-[9px] w-[14px] h-[14px] text-ink-faint" strokeWidth={1.7} />
      </button>
    </>
  );
}

"use client";

import { Icon } from "../Icon";
import { useTheme } from "./ThemeProvider";

/**
 * Animated Light/Dark switch with sun + moon micro-icons. The knob slides and
 * the icons cross-fade; sits in the upper-right context header of each themed
 * workspace.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={
        "relative inline-flex items-center w-[58px] h-9 rounded-full hairline bg-paper transition-colors duration-200 ease-in-out " +
        className
      }
    >
      {/* sliding knob */}
      <span
        className={
          "absolute top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-full bg-surface shadow-card transition-transform duration-200 ease-in-out " +
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
  );
}

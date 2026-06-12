"use client";

/**
 * The presentational 4-digit PIN pad — progress dots, an error line, and the
 * 10-key grid with a backspace. Parents own the PIN string and the submit
 * logic (and any physical-keyboard handling); this component just renders and
 * reports taps. Shared by the warm-terminal switch ({@link PinSwitcher}) and
 * the cold-terminal Store ID flow ({@link StoreSignIn}).
 */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PinPad({
  pin,
  error,
  submitting,
  onPush,
  onBackspace,
}: {
  pin: string;
  error: string | null;
  submitting: boolean;
  onPush: (digit: string) => void;
  onBackspace: () => void;
}) {
  return (
    <>
      {/* PIN dots */}
      <div className="mt-6 flex justify-center gap-3.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={
              "w-3.5 h-3.5 rounded-full transition duration-150 " +
              (i < pin.length ? "bg-brand-500" : "bg-ink/12 hairline")
            }
          />
        ))}
      </div>

      <p className="mt-3 text-center text-[12.5px] font-semibold text-rose-600 min-h-[1.1em]">
        {error ?? ""}
      </p>

      {/* Keypad */}
      <div className="mt-2 grid grid-cols-3 gap-2.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onPush(k)}
            disabled={submitting}
            className="h-14 rounded-[12px] bg-paper hairline text-[1.25rem] font-bold tracking-tight text-ink hover:bg-brand-50 hover:border-brand-200 active:scale-[0.97] transition duration-150 disabled:opacity-50"
          >
            {k}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          onClick={() => onPush("0")}
          disabled={submitting}
          className="h-14 rounded-[12px] bg-paper hairline text-[1.25rem] font-bold tracking-tight text-ink hover:bg-brand-50 hover:border-brand-200 active:scale-[0.97] transition duration-150 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          onClick={onBackspace}
          disabled={submitting || pin.length === 0}
          aria-label="Delete"
          className="h-14 rounded-[12px] grid place-items-center text-ink-soft hover:text-ink hover:bg-paper transition duration-150 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 5H8.5L3 12l5.5 7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
            <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
          </svg>
        </button>
      </div>
    </>
  );
}

import { Icon } from "./Icon";

/**
 * Head-to-head feature matrix — VendoPOS vs the global tools PH operators are
 * usually told to settle for. Factual marks only: ✓ = built in, ~ = partial /
 * workaround, — = not available. Consistent with WhyPH already naming Square and
 * Lightspeed. An accessible <table> with row/column headers; each glyph carries
 * visually-hidden text so screen readers don't read bare symbols.
 */
type Mark = "yes" | "partial" | "no";

const COLUMNS = ["VendoPOS", "Square", "Lightspeed"] as const;

const ROWS: { feature: string; marks: [Mark, Mark, Mark] }[] = [
  { feature: "BIR-ready receipts & reports", marks: ["yes", "no", "no"] },
  { feature: "GCash · Maya · QRPH built in", marks: ["yes", "no", "partial"] },
  { feature: "Keeps selling offline", marks: ["yes", "partial", "no"] },
  { feature: "Peso-first, end to end", marks: ["yes", "no", "no"] },
  { feature: "Per-tenant data isolation", marks: ["yes", "partial", "partial"] },
  { feature: "Local PH onboarding & support", marks: ["yes", "no", "no"] },
];

const MARK_LABEL: Record<Mark, string> = { yes: "Yes", partial: "Partial", no: "No" };

function MarkCell({ mark }: { mark: Mark }) {
  if (mark === "yes") {
    return (
      <span className="inline-grid place-items-center w-7 h-7 rounded-full bg-accent-50">
        <Icon name="check" className="w-4 h-4 text-accent-600" strokeWidth={2.4} />
        <span className="sr-only">{MARK_LABEL.yes}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center text-ink-faint">
      <span aria-hidden="true" className={mark === "partial" ? "text-[15px] font-bold" : "text-[18px] leading-none"}>
        {mark === "partial" ? "~" : "–"}
      </span>
      <span className="sr-only">{MARK_LABEL[mark]}</span>
    </span>
  );
}

export function Compare() {
  return (
    <section id="compare" className="py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            How we compare
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Built for here — not adapted for here.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            The things Philippine operators need on day one, set against the global tools they’re
            usually told to settle for.
          </p>
        </div>

        <div className="mt-12 reveal overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">
              Feature comparison of VendoPOS, Square, and Lightspeed for Philippine businesses.
            </caption>
            <thead>
              <tr className="hairline-b">
                <th
                  scope="col"
                  className="py-4 pr-4 text-[12px] font-bold uppercase tracking-wider text-ink-faint"
                >
                  Feature
                </th>
                {COLUMNS.map((col, i) => (
                  <th
                    key={col}
                    scope="col"
                    className={
                      "py-4 px-4 text-center text-[13.5px] font-extrabold tracking-tight " +
                      (i === 0
                        ? "text-brand-700 bg-brand-50 rounded-t-[12px]"
                        : "text-ink-soft")
                    }
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, r) => (
                <tr key={row.feature} className="hairline-b">
                  <th
                    scope="row"
                    className="py-4 pr-4 text-[14.5px] font-semibold text-ink align-middle"
                  >
                    {row.feature}
                  </th>
                  {row.marks.map((mark, i) => (
                    <td
                      key={COLUMNS[i]}
                      className={
                        "py-4 px-4 text-center align-middle " +
                        (i === 0 ? "bg-brand-50 " : "") +
                        (i === 0 && r === ROWS.length - 1 ? "rounded-b-[12px]" : "")
                      }
                    >
                      <MarkCell mark={mark} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

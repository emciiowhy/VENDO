/**
 * "Coming soon" pill for features/modules that aren't shipped yet.
 *
 * Per the accuracy decision, the marketing site keeps its full, aspirational
 * feature set but visually flags what isn't live. A `status` of "soon" renders
 * this badge; "live" renders nothing. Amber tokens read on both themes.
 */
export type FeatureStatus = "live" | "soon";

export function RoadmapBadge({
  status,
  className = "",
}: {
  status?: FeatureStatus;
  className?: string;
}) {
  if (status !== "soon") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-600 hairline ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Coming soon
    </span>
  );
}

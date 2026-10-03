import { getTrustedBrands, type Brand } from "@/lib/publicTenants";
import { resolveAssetUrl } from "@/lib/images";

/**
 * "Trusted by" belt — an infinitely loop-scrolling marquee of the stores live on
 * VendoPOS. This is an async server component: it fetches the live tenant roster
 * during the SSR pass (10-min edge cache) and leads with our flagship anchor
 * brands, falling back to those alone if the API is unreachable — see
 * lib/publicTenants.
 *
 * Each store renders as a soft chip (tinted monogram or uploaded logo + wordmark)
 * that rests at a gentle opacity and lifts to full on hover. The inner track
 * holds the brand set twice (Batch 1 + Batch 2) and slides to -50% on a linear
 * loop (`animate-marquee-infinite`), so the belt reads as a seamless infinite
 * scroll with no gap when it resets at the midpoint. The belt pauses on hover so
 * a visitor can read a mark. Ink / surface tokens keep everything correct across
 * Light & Dark with no per-theme overrides.
 */
function Wordmark({ name, mark, logoUrl }: Brand) {
  const logo = resolveAssetUrl(logoUrl);
  return (
    <div className="group mx-2.5 shrink-0 select-none">
      <div className="flex items-center gap-2.5 rounded-full bg-surface/70 hairline pl-2 pr-5 py-2 opacity-80 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-0.5 group-hover:bg-surface group-hover:opacity-100 group-hover:shadow-soft">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={`${name} logo`}
            className="w-8 h-8 rounded-[9px] hairline object-cover bg-surface"
          />
        ) : (
          <span className="grid place-items-center w-8 h-8 rounded-[9px] bg-brand-50 text-brand-600 font-extrabold text-[12.5px] tracking-tight">
            {mark}
          </span>
        )}
        <span className="text-[1rem] font-extrabold tracking-tightest whitespace-nowrap text-ink">
          {name}
        </span>
      </div>
    </div>
  );
}

export async function LogoMarquee() {
  const brands = await getTrustedBrands();

  return (
    <section className="py-14 bg-paper hairline-b overflow-hidden">
      <p className="flex items-center justify-center gap-2.5 text-center text-[12.5px] font-bold tracking-widest uppercase text-ink-faint">
        {/* Live-roster indicator — a quiet pulse that signals the belt updates
            itself as new stores come online. Stilled under reduced-motion. */}
        <span className="relative flex w-2 h-2" aria-hidden="true">
          <span className="absolute inline-flex w-full h-full rounded-full bg-accent-500 opacity-70 animate-ping motion-reduce:hidden" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-accent-500" />
        </span>
        Trusted by coffee bars, bakeries &amp; pastry cafés
      </p>

      {/* Relative, overflow-hidden window; the inner track scrolls beneath the
          edge-fade mask. */}
      <div className="relative mt-8 flex overflow-hidden marquee-mask">
        <div className="flex items-center animate-marquee-infinite" aria-hidden="true">
          {/* Batch 1 followed immediately by Batch 2 → the -50% slide loops with
              no visible seam. */}
          {[0, 1].map((batch) => (
            <div key={batch} className="flex items-center shrink-0">
              {brands.map((b) => (
                <Wordmark
                  key={`${batch}-${b.name}`}
                  name={b.name}
                  mark={b.mark}
                  logoUrl={b.logoUrl}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

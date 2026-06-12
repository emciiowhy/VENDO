import { getTrustedBrands, type Brand } from "@/lib/publicTenants";
import { resolveAssetUrl } from "@/lib/images";

/**
 * "Trusted by" belt — an infinitely loop-scrolling marquee of monochrome
 * wordmarks for the stores live on VendoPOS. This is an async server component:
 * it fetches the live tenant roster during the SSR pass (10-min edge cache) and
 * leads with our flagship anchor brands, falling back to those alone if the API
 * is unreachable — see lib/publicTenants.
 *
 * The inner track holds the brand set twice (Batch 1 + Batch 2) and slides to
 * -50% on a linear loop (`animate-marquee-infinite`), so the belt reads as a
 * seamless infinite scroll with no gap when it resets at the midpoint. Logos sit
 * at a soft uniform opacity and lift to full on hover; ink / surface tokens keep
 * the marks correct across Light & Dark with no per-theme overrides.
 */
function Wordmark({ name, mark, logoUrl }: Brand) {
  const logo = resolveAssetUrl(logoUrl);
  return (
    <div className="flex items-center gap-2.5 px-7 shrink-0 select-none opacity-60 hover:opacity-100 transition-opacity duration-200 ease-in-out">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="w-8 h-8 rounded-[9px] hairline object-cover bg-surface"
        />
      ) : (
        <span className="grid place-items-center w-8 h-8 rounded-[9px] hairline bg-surface text-ink font-extrabold text-[13px] tracking-tight">
          {mark}
        </span>
      )}
      <span className="text-[1.05rem] font-extrabold tracking-tightest whitespace-nowrap text-ink">
        {name}
      </span>
    </div>
  );
}

export async function LogoMarquee() {
  const brands = await getTrustedBrands();

  return (
    <section className="py-14 bg-paper hairline-b overflow-hidden">
      <p className="text-center text-[12.5px] font-bold tracking-widest uppercase text-ink-faint">
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

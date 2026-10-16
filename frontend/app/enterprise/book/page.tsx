import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import { IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { CalendlyBooking } from "@/app/components/marketing/CalendlyBooking";

export const metadata: Metadata = pageMetadata({
  title: "Book your enterprise consultation — VendoPOS",
  description:
    "Schedule your 1-on-1 Zoom consultation with a VendoPOS solutions lead to map your rollout. Pick a time that suits you.",
  path: "/enterprise/book",
  ogTitle: "Book your VendoPOS enterprise consultation",
  ogDescription:
    "Pick a time for your 1-on-1 Zoom consultation — a VendoPOS solutions lead will scope your rollout with you.",
});

/**
 * The in-app Enterprise booking route. Reached from the Enterprise concierge CTAs
 * (and from the post-submit success screen, which carries the prospect's name and
 * email in the query string for Calendly prefill). The embedded scheduler lives in
 * the client CalendlyBooking component — wrapped in Suspense because it reads the
 * query string via useSearchParams.
 */
export default function EnterpriseBookPage() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        <Suspense fallback={null}>
          <CalendlyBooking />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

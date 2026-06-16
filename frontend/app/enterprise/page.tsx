import type { Metadata } from "next";
import { IconSprite } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { EnterpriseConcierge } from "@/app/components/marketing/EnterpriseConcierge";

export const metadata: Metadata = {
  title: "Enterprise concierge onboarding — VendoPOS",
  description:
    "Enterprise on VendoPOS is high-touch: a 1-on-1 Zoom consultation and an in-person rollout meeting to map your multi-location operation. Tell us about your business and we'll plan it with you.",
  openGraph: {
    title: "VendoPOS Enterprise concierge",
    description:
      "A guided onboarding for multi-location operations — 1-on-1 consultation, in-person rollout mapping, and a guided go-live.",
    type: "website",
  },
};

/**
 * The Enterprise concierge funnel route. Reached from the pricing page's
 * Enterprise card (which routes here instead of the self-serve trial checkout)
 * and from the trial-recovery view. Marketing chrome (Nav/Footer) wraps the
 * intake + scheduling component.
 */
export default function EnterprisePage() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        <EnterpriseConcierge />
      </main>
      <Footer />
    </>
  );
}

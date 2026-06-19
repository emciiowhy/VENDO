import { IconSprite } from "./components/Icon";
import { ScrollReveal } from "./components/ScrollReveal";
import { AnnounceBar } from "./components/AnnounceBar";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { TrustBar } from "./components/TrustBar";
import { LogoMarquee } from "./components/LogoMarquee";
import { Problem } from "./components/Problem";
import { CoreTools } from "./components/CoreTools";
import { WhyPH } from "./components/WhyPH";
import { Compare } from "./components/Compare";
import { Testimonials } from "./components/Testimonials";
import { HowItWorks } from "./components/HowItWorks";
import { Pricing } from "./components/Pricing";
import { FAQ } from "./components/FAQ";
import { DemoForm } from "./components/DemoForm";
import { Footer } from "./components/Footer";
import { StickyCta } from "./components/StickyCta";

/**
 * First-time-buyer promo toggle. Flip to false to retire the campaign — the
 * pricing cards drop the "20% OFF your first 3 months" badge with no other
 * change. (A future iteration can source this from a real campaign/config seam.)
 */
const FIRST_PURCHASE_PROMO = true;

export default function Home() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <AnnounceBar promo={FIRST_PURCHASE_PROMO} />
      <Nav />
      <main>
        <Hero />
        <TrustBar />
        <LogoMarquee />
        <Problem />
        <CoreTools />
        <WhyPH />
        <Compare />
        <Testimonials />
        <HowItWorks />
        <Pricing isFirstPurchase={FIRST_PURCHASE_PROMO} />
        <FAQ />
        <DemoForm />
      </main>
      <Footer />
      <StickyCta />
    </>
  );
}

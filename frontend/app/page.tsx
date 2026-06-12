import { IconSprite } from "./components/Icon";
import { ScrollReveal } from "./components/ScrollReveal";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { TrustBar } from "./components/TrustBar";
import { LogoMarquee } from "./components/LogoMarquee";
import { Problem } from "./components/Problem";
import { CoreTools } from "./components/CoreTools";
import { WhyPH } from "./components/WhyPH";
import { Testimonials } from "./components/Testimonials";
import { HowItWorks } from "./components/HowItWorks";
import { Pricing } from "./components/Pricing";
import { FAQ } from "./components/FAQ";
import { DemoForm } from "./components/DemoForm";
import { Footer } from "./components/Footer";

export default function Home() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        <Hero />
        <TrustBar />
        <LogoMarquee />
        <Problem />
        <CoreTools />
        <WhyPH />
        <Testimonials />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}

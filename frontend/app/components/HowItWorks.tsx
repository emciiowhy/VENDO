const steps = [
  {
    label: "STEP 01",
    title: "Request a demo",
    body: "Tell us about your business. We’ll show you exactly how VendoPOS fits your shop, restaurant, or store.",
  },
  {
    label: "STEP 02",
    title: "We set you up",
    body: "Our team configures your isolated workspace, loads your products, and trains your staff — hands-on, no guesswork.",
  },
  {
    label: "STEP 03",
    title: "Run your business",
    body: "Start ringing up sales, tracking stock, and seeing your numbers — all from one system, from day one.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-28 bg-ink text-white relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-[0.15] [mask-image:radial-gradient(700px_400px_at_50%_0%,black,transparent_75%)]" />
      <div className="relative max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-200">
            Hands-on onboarding
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold text-white">
            How it works
          </h2>
          <p className="mt-5 text-[1.08rem] text-white/65 leading-relaxed">
            No complicated self-setup. We onboard you personally, so you’re running on day one.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-4 reveal">
          {steps.map((s) => (
            <div key={s.label} className="lift rounded-xl2 border border-white/10 bg-white/[0.03] p-8">
              <span className="text-[13px] font-bold text-brand-200 tracking-widest">{s.label}</span>
              <h3 className="mt-4 text-[1.2rem] font-bold tracking-tight">{s.title}</h3>
              <p className="mt-2.5 text-white/65 text-[0.96rem] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

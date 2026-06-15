import { describe, it, expect } from "vitest";
import { renderOnboardingEmail, type OnboardingDetails } from "./onboardingEmail.js";
import { sendEmail } from "./email.js";

const base: OnboardingDetails = {
  ownerName: "Juan dela Cruz",
  ownerEmail: "owner@kapenijuan.ph",
  storeName: "Kape ni Juan",
  slug: "kape-ni-juan",
  plan: "business",
  hasPassword: true,
};

describe("renderOnboardingEmail", () => {
  it("puts the store name in the subject", () => {
    expect(renderOnboardingEmail(base).subject).toContain("Kape ni Juan");
  });

  it("spells out the sign-in steps: login URL, Store ID and the plan", () => {
    const { text } = renderOnboardingEmail(base);
    expect(text).toContain("/login");
    expect(text).toContain("kape-ni-juan"); // Store ID
    expect(text).toContain("Business"); // human plan label
    expect(text).toContain("owner@kapenijuan.ph");
  });

  it("tells a password owner to sign in with their password", () => {
    const { text, html } = renderOnboardingEmail({ ...base, hasPassword: true });
    expect(text).toContain("password you set");
    expect(text).not.toContain("Continue with Google");
    expect(html).toContain("password you set");
  });

  it("tells a Google-only owner to continue with Google", () => {
    const { text } = renderOnboardingEmail({ ...base, hasPassword: false });
    expect(text).toContain("Continue with Google");
    expect(text).not.toContain("password you set");
  });

  it("escapes HTML-significant characters in the HTML body", () => {
    const { html } = renderOnboardingEmail({ ...base, storeName: "Tom & Jerry <Café>" });
    expect(html).toContain("Tom &amp; Jerry &lt;Café&gt;"); // & and angle brackets escaped
    expect(html).not.toContain("<Café>"); // never injected raw
  });
});

describe("sendEmail log transport (no RESEND_API_KEY configured)", () => {
  it("resolves to a non-delivered 'log' result without throwing", async () => {
    const result = await sendEmail({
      to: "owner@kapenijuan.ph",
      subject: "Welcome",
      text: "Hello",
    });
    expect(result).toEqual({ delivered: false, transport: "log" });
  });
});

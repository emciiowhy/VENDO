import { describe, it, expect } from "vitest";
import { renderVerificationEmail, verifyUrlFor } from "./verificationEmail.js";

describe("verification email", () => {
  const d = { name: "Juan dela Cruz", email: "juan@kapenijuan.ph", token: "tok_12345" };

  it("builds a verify URL pointing at the frontend /verify-email page with the token", () => {
    const url = verifyUrlFor("a b+c");
    expect(url).toContain("/verify-email?token=");
    // The token is URL-encoded so special characters survive the round-trip.
    expect(url).toContain(encodeURIComponent("a b+c"));
  });

  it("renders subject + bodies containing the name and the verification link", () => {
    const { subject, text, html } = renderVerificationEmail(d);
    expect(subject.toLowerCase()).toContain("confirm");
    const link = verifyUrlFor(d.token);
    expect(text).toContain(d.name);
    expect(text).toContain(link);
    expect(html).toContain(d.name);
    expect(html).toContain(link);
  });

  it("escapes HTML-significant characters in the name", () => {
    const { html } = renderVerificationEmail({ ...d, name: 'A <b> & "c"' });
    expect(html).toContain("A &lt;b&gt; &amp; &quot;c&quot;");
    expect(html).not.toContain("<b>");
  });
});

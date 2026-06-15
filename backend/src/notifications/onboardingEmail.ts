import { env } from "../env.js";
import { sendEmail } from "./email.js";

/**
 * The welcome / "here's how to get started" email the Super Admin sends a Lead
 * the moment their store is provisioned — the email counterpart of the in-app
 * notifyNewTenant alert. It spells out the exact sign-in steps so the new owner
 * can reach their live store: the Store ID they type alongside their email, and
 * whether they sign in with a password or with Google (which depends on whether
 * a password was set during provisioning).
 *
 * `renderOnboardingEmail` is pure and deterministic so it unit-tests without any
 * transport or database; `sendOwnerOnboardingEmail` is the best-effort producer
 * the provisioning flow fires after COMMIT.
 */

export interface OnboardingDetails {
  ownerName: string;
  ownerEmail: string;
  storeName: string;
  /** The tenant's Store ID — typed with the email at sign-in. */
  slug: string;
  /** Lowercase plan id: 'starter' | 'business' | 'enterprise'. */
  plan: string;
  /**
   * Whether the owner has a password (Store ID + email + password sign-in) vs.
   * Google-only. Selects which sign-in step the email spells out.
   */
  hasPassword: boolean;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

/** Build the new owner's onboarding email (subject + plain-text + HTML bodies). */
export function renderOnboardingEmail(d: OnboardingDetails): RenderedEmail {
  const loginUrl = `${env.frontendUrl.replace(/\/+$/, "")}/login`;
  const planLabel = PLAN_LABEL[d.plan] ?? d.plan;
  const signInStep = d.hasPassword
    ? `Sign in with your email (${d.ownerEmail}) and the password you set.`
    : `Choose “Continue with Google” and use ${d.ownerEmail}.`;

  const steps = [
    `Open ${loginUrl}`,
    `Enter your Store ID: ${d.slug}`,
    signInStep,
    `Set up your store profile and add your first products — then you're ready to ring up your first sale.`,
  ];

  const subject = `Your VendoPOS store “${d.storeName}” is ready`;

  const text = [
    `Hi ${d.ownerName},`,
    ``,
    `Welcome to VendoPOS! Your store "${d.storeName}" is now live on the ${planLabel} plan.`,
    `Here's how to get in and get started:`,
    ``,
    ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    ``,
    `Keep this email handy — your Store ID (${d.slug}) is what you type alongside your email each time you sign in.`,
    ``,
    `Welcome aboard,`,
    `The VendoPOS team`,
  ].join("\n");

  const html = renderHtml({ ...d, planLabel, loginUrl, steps });

  return { subject, text, html };
}

/** Inline-styled HTML body — kept email-client-safe (no external CSS, no <style>). */
function renderHtml(
  d: OnboardingDetails & { planLabel: string; loginUrl: string; steps: string[] },
): string {
  const stepRows = d.steps
    .map(
      (s, i) => `
        <tr>
          <td valign="top" style="padding:6px 12px 6px 0;">
            <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:#4f46e5;color:#ffffff;font-size:13px;font-weight:700;">${i + 1}</span>
          </td>
          <td valign="top" style="padding:6px 0;color:#1f2937;font-size:15px;line-height:1.5;">${escapeHtml(s)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:28px 32px;background:#0b1220;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.02em;">
                VendoPOS
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0b1220;letter-spacing:-0.02em;">Your store is ready 🎉</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
                  Hi ${escapeHtml(d.ownerName)}, welcome to VendoPOS! <strong>${escapeHtml(d.storeName)}</strong> is now live on the ${escapeHtml(d.planLabel)} plan. Here's how to get in and get started:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">${stepRows}
                </table>
                <a href="${escapeHtml(d.loginUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">Sign in to your store</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  Keep this email handy — your Store ID <strong style="color:#374151;">${escapeHtml(d.slug)}</strong> is what you type alongside your email each time you sign in.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                Welcome aboard — the VendoPOS team
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Minimal HTML-entity escape for values interpolated into the email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Best-effort: email the new owner their onboarding steps. Fire-and-forget from
 * the provisioning transaction (after COMMIT), exactly like notifyNewTenant — a
 * mail failure must never undo a store that was already created. Resolves to a
 * console warning rather than rejecting if the transport can't deliver.
 */
export async function sendOwnerOnboardingEmail(d: OnboardingDetails): Promise<void> {
  try {
    const { subject, text, html } = renderOnboardingEmail(d);
    const result = await sendEmail({ to: d.ownerEmail, subject, text, html });
    if (!result.delivered) {
      console.warn(
        `[onboarding] onboarding email for ${d.ownerEmail} not delivered (transport: ${result.transport}).`,
      );
    }
  } catch (err) {
    console.error("[onboarding] failed to send onboarding email:", err);
  }
}

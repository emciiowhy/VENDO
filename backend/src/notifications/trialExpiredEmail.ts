import { env } from "../env.js";
import { sendEmail, type EmailResult } from "./email.js";

/**
 * The recovery email a store owner receives the moment their 14-day free trial
 * lapses — the email counterpart of flipping the tenant to `trial_expired`. It
 * fires exactly once, from the single seam that wins the lazy status transition
 * (see billing/trial.ts), so a store can't be re-emailed on every subsequent
 * request. Its whole job is to pull the owner back: spell out that the trial has
 * ended and route them to pick a paid plan to reactivate their workspace.
 *
 * `renderTrialExpiredEmail` is pure and deterministic so it unit-tests without a
 * transport or database; `sendTrialExpiredEmail` is the best-effort producer the
 * transition fires after the row is flipped — it NEVER throws (a mail failure
 * must never break the request that happened to trip the expiry).
 */

export interface TrialExpiredDetails {
  ownerName: string;
  ownerEmail: string;
  storeName: string;
  /** Lowercase plan id the store was trialling: 'starter' | 'business'. */
  plan: string;
  /** ISO timestamp the trial window closed (for the "ended on" line). */
  trialEndedAt: string | null;
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

/** Format an ISO timestamp as a plain calendar date, or null when absent. */
function endedOnLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

/** Build the trial-expired recovery email (subject + plain-text + HTML bodies). */
export function renderTrialExpiredEmail(d: TrialExpiredDetails): RenderedEmail {
  const pricingUrl = `${env.frontendUrl.replace(/\/+$/, "")}/#pricing`;
  const planLabel = PLAN_LABEL[d.plan] ?? d.plan;
  const endedOn = endedOnLabel(d.trialEndedAt);

  const subject = `Your VendoPOS trial for “${d.storeName}” has ended`;

  const text = [
    `Hi ${d.ownerName},`,
    ``,
    `Your 14-day free trial of VendoPOS for "${d.storeName}"${endedOn ? ` ended on ${endedOn}` : ` has ended`}.`,
    ``,
    `Your store and all of its data are safe — but the workspace is paused until you choose a plan. Pick up right where you left off by subscribing to ${planLabel} (or any plan that fits):`,
    ``,
    `  ${pricingUrl}`,
    ``,
    `It takes a minute and your store reactivates immediately. Questions about which plan is right for you? Just reply to this email.`,
    ``,
    `We'd love to keep you,`,
    `The VendoPOS team`,
  ].join("\n");

  const html = renderHtml({ ...d, planLabel, pricingUrl, endedOn });

  return { subject, text, html };
}

/** Inline-styled HTML body — kept email-client-safe (no external CSS, no <style>). */
function renderHtml(
  d: TrialExpiredDetails & { planLabel: string; pricingUrl: string; endedOn: string | null },
): string {
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
                <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0b1220;letter-spacing:-0.02em;">Your free trial has ended</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">
                  Hi ${escapeHtml(d.ownerName)}, your 14-day free trial for <strong>${escapeHtml(d.storeName)}</strong>${d.endedOn ? ` ended on <strong>${escapeHtml(d.endedOn)}</strong>` : ` has ended`}.
                </p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#374151;">
                  Your store and all of its data are safe — the workspace is just paused until you choose a plan. Subscribe to <strong>${escapeHtml(d.planLabel)}</strong> (or any plan that fits) and you'll be back in business the moment you do.
                </p>
                <a href="${escapeHtml(d.pricingUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">Choose a plan &amp; reactivate</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  Not sure which plan is right for you? Just reply to this email — we're happy to help you pick.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                We'd love to keep you — the VendoPOS team
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
 * Best-effort: email the owner their trial-expired recovery prompt. Fired from
 * the lazy status transition once a trial lapses — a mail failure must never
 * disturb the request that tripped the expiry, so this NEVER throws: a render or
 * transport error is logged and folded into a non-delivered result.
 */
export async function sendTrialExpiredEmail(d: TrialExpiredDetails): Promise<EmailResult> {
  try {
    const { subject, text, html } = renderTrialExpiredEmail(d);
    const result = await sendEmail({ to: d.ownerEmail, subject, text, html });
    if (!result.delivered) {
      console.warn(
        `[trial] recovery email for ${d.ownerEmail} not delivered (transport: ${result.transport}).`,
      );
    }
    return result;
  } catch (err) {
    console.error("[trial] failed to send recovery email:", err);
    return { delivered: false, transport: "log" };
  }
}

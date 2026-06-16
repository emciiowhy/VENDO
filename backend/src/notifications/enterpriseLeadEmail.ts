import { env } from "../env.js";
import { sendEmail, type EmailResult } from "./email.js";

/**
 * The internal alert the VendoPOS team receives when a prospect completes the
 * Enterprise concierge intake (see leads/leads.router.ts → POST /enterprise).
 * Unlike the owner-facing onboarding/recovery mails, this one goes to OUR ops
 * inbox (env.email.adminAlertTo, falling back to the `from` mailbox) and carries
 * the lead's operational details so a rep can prep the mandatory 1-on-1 Zoom
 * consultation and the in-person multi-location rollout mapping.
 *
 * `renderEnterpriseLeadAlertEmail` is pure/deterministic for unit tests;
 * `sendEnterpriseLeadAlertEmail` is the best-effort producer the intake route
 * fires — it NEVER throws (a mail failure must not fail the prospect's request).
 */

export interface EnterpriseLeadDetails {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  /** Free-text scale of the operation, e.g. "6–10 branches". */
  locations: string;
  /** What they run today (optional), e.g. "Loyverse + manual spreadsheets". */
  currentSystem: string | null;
  /** Anything else the prospect wants the team to know (optional). */
  notes: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** The recipient of internal alerts: the configured ops inbox, else the sender mailbox. */
function alertRecipient(): string {
  return env.email.adminAlertTo || env.email.from;
}

/** Build the internal Enterprise-lead alert (subject + plain-text + HTML bodies). */
export function renderEnterpriseLeadAlertEmail(d: EnterpriseLeadDetails): RenderedEmail {
  const subject = `New Enterprise inquiry: ${d.businessName}`;

  const lines: [string, string][] = [
    ["Contact", `${d.contactName} <${d.email}>`],
    ["Phone", d.phone],
    ["Business", d.businessName],
    ["Scale", d.locations],
    ["Current system", d.currentSystem ?? "—"],
    ["Notes", d.notes ?? "—"],
  ];

  const text = [
    `A prospect just completed the Enterprise concierge intake.`,
    ``,
    ...lines.map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `Next step: reach out to book their 1-on-1 Zoom consultation and scope the`,
    `in-person rollout for mapping their multi-location configuration.`,
  ].join("\n");

  const html = renderHtml({ subject, lines });

  return { subject, text, html };
}

/** Inline-styled HTML body — email-client-safe (no external CSS / <style>). */
function renderHtml(d: { subject: string; lines: [string, string][] }): string {
  const rows = d.lines
    .map(
      ([k, v]) => `
        <tr>
          <td valign="top" style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;font-weight:700;white-space:nowrap;">${escapeHtml(k)}</td>
          <td valign="top" style="padding:6px 0;color:#111827;font-size:14px;line-height:1.5;">${escapeHtml(v)}</td>
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
              <td style="padding:24px 32px;background:#0b1220;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">
                VendoPOS · Enterprise inquiry
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">
                  A prospect just completed the Enterprise concierge intake:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}
                </table>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  Next step: book their 1-on-1 Zoom consultation and scope the in-person rollout for mapping their multi-location configuration.
                </p>
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
 * Best-effort: alert the VendoPOS team about a new Enterprise inquiry. Fired from
 * the intake route after the lead is persisted — NEVER throws, so a mail failure
 * folds into a non-delivered result rather than failing the prospect's submission.
 */
export async function sendEnterpriseLeadAlertEmail(
  d: EnterpriseLeadDetails,
): Promise<EmailResult> {
  try {
    const { subject, text, html } = renderEnterpriseLeadAlertEmail(d);
    const result = await sendEmail({ to: alertRecipient(), subject, text, html });
    if (!result.delivered) {
      console.warn(
        `[enterprise] lead alert not delivered (transport: ${result.transport}).`,
      );
    }
    return result;
  } catch (err) {
    console.error("[enterprise] failed to send lead alert:", err);
    return { delivered: false, transport: "log" };
  }
}

import { env } from "../env.js";
import { sendEmail, type EmailResult } from "./email.js";

/**
 * The "confirm your email" message sent to a prospect the moment they submit the
 * Request-a-Demo form. It carries a single-use, time-limited link back to the
 * frontend `/verify-email` page (which posts the token to the API). Verifying
 * proves the prospect controls the address before the Super Admin provisions a
 * store — catching typos and fake addresses up front.
 *
 * `renderVerificationEmail` is pure/deterministic so it unit-tests without any
 * transport; `sendLeadVerificationEmail` is the best-effort producer the lead
 * submit flow fires. Like every producer here it NEVER throws and degrades to a
 * logged, non-delivered result when email isn't configured.
 */

export interface VerificationDetails {
  name: string;
  email: string;
  /** The raw verification token (goes in the link; never persisted raw). */
  token: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** The frontend page that reads the token and posts it to the API. */
export function verifyUrlFor(token: string): string {
  const base = env.frontendUrl.replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Build the verification email (subject + plain-text + HTML bodies). */
export function renderVerificationEmail(d: VerificationDetails): RenderedEmail {
  const verifyUrl = verifyUrlFor(d.token);
  const subject = "Confirm your email for VendoPOS";

  const text = [
    `Hi ${d.name},`,
    ``,
    `Thanks for requesting a VendoPOS demo. Please confirm this email address so`,
    `we can set up your store:`,
    ``,
    `  ${verifyUrl}`,
    ``,
    `This link expires in 24 hours. If you didn't request a VendoPOS demo, you`,
    `can safely ignore this email.`,
    ``,
    `The VendoPOS team`,
  ].join("\n");

  const html = renderHtml({ name: d.name, verifyUrl });
  return { subject, text, html };
}

/** Inline-styled, email-client-safe HTML body (no external CSS, no <style>). */
function renderHtml(d: { name: string; verifyUrl: string }): string {
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
                <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0b1220;letter-spacing:-0.02em;">Confirm your email</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
                  Hi ${escapeHtml(d.name)}, thanks for requesting a VendoPOS demo. Confirm this email address so we can set up your store.
                </p>
                <a href="${escapeHtml(d.verifyUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">Confirm my email</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  This link expires in 24 hours. If you didn't request a VendoPOS demo, you can safely ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
                The VendoPOS team
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
 * Best-effort: email the prospect their verification link. Fired after the lead
 * is persisted; NEVER throws (a render or transport error is logged and folded
 * into a non-delivered result) so a mail hiccup can't fail the submission.
 */
export async function sendLeadVerificationEmail(d: VerificationDetails): Promise<EmailResult> {
  try {
    const { subject, text, html } = renderVerificationEmail(d);
    const result = await sendEmail({ to: d.email, subject, text, html });
    if (!result.delivered) {
      console.warn(
        `[verify] verification email for ${d.email} not delivered (transport: ${result.transport}).`,
      );
    }
    return result;
  } catch (err) {
    console.error("[verify] failed to send verification email:", err);
    return { delivered: false, transport: "log" };
  }
}

import { env } from "../env.js";
import { sendEmail, type EmailResult } from "./email.js";

/**
 * The email an owner receives when a Super-Admin resets their password from the
 * support console (A1). It carries the one-time temporary password and tells
 * them to sign in and change it. Mirrors onboardingEmail.ts in posture: a pure,
 * deterministic renderer plus a best-effort sender that NEVER throws — a mail
 * hiccup must not fail the reset, which has already landed in the users table.
 */

export interface PasswordResetDetails {
  ownerName: string;
  ownerEmail: string;
  storeName: string;
  /** Store ID typed alongside the email at sign-in. */
  slug: string | null;
  /** The freshly generated one-time password (plain text, for this mail only). */
  tempPassword: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Build the password-reset email (subject + plain-text + HTML bodies). */
export function renderPasswordResetEmail(d: PasswordResetDetails): RenderedEmail {
  const loginUrl = `${env.frontendUrl.replace(/\/+$/, "")}/login`;
  const subject = `Your VendoPOS password was reset`;

  const text = [
    `Hi ${d.ownerName},`,
    ``,
    `A VendoPOS administrator reset the password for your store "${d.storeName}".`,
    `Use this temporary password to sign in, then change it right away from`,
    `Account → Security.`,
    ``,
    `  Sign in:   ${loginUrl}`,
    d.slug ? `  Store ID:  ${d.slug}` : ``,
    `  Email:     ${d.ownerEmail}`,
    `  Password:  ${d.tempPassword}`,
    ``,
    `If you didn't expect this, contact support immediately.`,
    ``,
    `The VendoPOS team`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const html = renderHtml({ ...d, loginUrl });
  return { subject, text, html };
}

function renderHtml(d: PasswordResetDetails & { loginUrl: string }): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;color:#1f2937;font-size:14px;font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace;">${escapeHtml(value)}</td>
    </tr>`;
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
                <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0b1220;letter-spacing:-0.02em;">Your password was reset</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
                  Hi ${escapeHtml(d.ownerName)}, a VendoPOS administrator reset the password for <strong>${escapeHtml(d.storeName)}</strong>. Sign in with the temporary password below, then change it right away from <strong>Account → Security</strong>.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f9fafb;border-radius:12px;padding:16px;">
                  ${d.slug ? row("Store ID", d.slug) : ""}
                  ${row("Email", d.ownerEmail)}
                  ${row("Temporary password", d.tempPassword)}
                </table>
                <a href="${escapeHtml(d.loginUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 22px;border-radius:10px;">Sign in to your store</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  If you didn't expect this, contact support immediately.
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Best-effort: email the owner their temporary password. NEVER throws. */
export async function sendPasswordResetEmail(d: PasswordResetDetails): Promise<EmailResult> {
  try {
    const { subject, text, html } = renderPasswordResetEmail(d);
    const result = await sendEmail({ to: d.ownerEmail, subject, text, html });
    if (!result.delivered) {
      console.warn(
        `[support] password-reset email for ${d.ownerEmail} not delivered (transport: ${result.transport}).`,
      );
    }
    return result;
  } catch (err) {
    console.error("[support] failed to send password-reset email:", err);
    return { delivered: false, transport: "log" };
  }
}

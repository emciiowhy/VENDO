import { Resend } from "resend";
import { env } from "../env.js";

/**
 * Transactional email transport — provider-agnostic and SAFE BY DEFAULT.
 *
 * With no RESEND_API_KEY configured (a fresh clone, dev, CI) `sendEmail` falls
 * back to a "log" transport that prints the rendered message to the server
 * console instead of reaching the network — so onboarding flows work end-to-end
 * with zero external setup, and turning on real delivery later is a single env
 * var. Mirrors the rest of the codebase's optional-config posture (Google OAuth,
 * media storage): the API still boots and the surrounding flow still succeeds
 * when the integration is unset.
 *
 * Real delivery goes through the official `resend` SDK. The client is created
 * lazily — only once a key is present, after the guard below — so the SDK never
 * runs (and can never complain about a missing key) on a key-less boot.
 *
 * The function NEVER throws: a missing key, a network error, or a provider
 * rejection all resolve to `{ delivered: false }`, so a mail hiccup can never
 * fail the provisioning transaction that fires it (it's awaited only inside a
 * best-effort, fire-and-forget producer — see onboardingEmail.ts).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body (always sent; the universal fallback). */
  text: string;
  /** Optional HTML body; rendered by clients that support it. */
  html?: string;
}

export type EmailTransport = "resend" | "log";

export interface EmailResult {
  delivered: boolean;
  transport: EmailTransport;
}

/** Send one transactional email via the configured transport. */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const { resendApiKey, from } = env.email;

  // No provider configured → log transport. Quiet under tests; otherwise dump
  // the rendered message so a developer can read exactly what would have gone out.
  if (!resendApiKey) {
    if (env.nodeEnv !== "test") {
      const quoted = msg.text
        .split("\n")
        .map((line) => `  | ${line}`)
        .join("\n");
      console.log(
        `[email] log transport (set RESEND_API_KEY to deliver for real)\n` +
          `  to:      ${msg.to}\n` +
          `  subject: ${msg.subject}\n` +
          quoted,
      );
    }
    return { delivered: false, transport: "log" };
  }

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    if (error) {
      console.error(`[email] Resend rejected the send (${error.name}): ${error.message}`);
      return { delivered: false, transport: "resend" };
    }
    return { delivered: true, transport: "resend" };
  } catch (err) {
    console.error("[email] transport error:", err);
    return { delivered: false, transport: "resend" };
  }
}

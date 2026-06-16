import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { Session } from "./auth.types.js";

/**
 * Signs and verifies the VendoPOS application JWT. The payload carries
 * `userId`, `tenantId`, and `role` directly so downstream handlers can enforce
 * tenant row-isolation straight from the token (see auth.types.ts).
 *
 * HS256 with a server-side secret — the token never leaves our control because
 * it rides in an HTTP-only cookie, never readable JS.
 */
function secret(): string {
  if (!env.jwtSecret) {
    throw new Error(
      "JWT_SECRET is not set. Add it to backend/.env before enabling sign-in.",
    );
  }
  return env.jwtSecret;
}

const MAX_AGE_SECONDS = Math.floor(env.session.maxAgeMs / 1000);

export function signSession(session: Session): string {
  // Only the identity claims ride in the token; `sid` (when present) ties it to
  // a revocable `sessions` row checked by the auth middleware.
  const payload: Session = {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    email: session.email,
    name: session.name,
    ...(session.sid ? { sid: session.sid } : {}),
    // The impersonator identity rides in the signed token so it can't be forged
    // and never needs a second cookie. Present only on impersonation sessions.
    ...(session.impersonator ? { impersonator: session.impersonator } : {}),
  };
  return jwt.sign(payload, secret(), {
    algorithm: "HS256",
    expiresIn: MAX_AGE_SECONDS,
    issuer: "vendopos",
  });
}

/** Returns the decoded Session, or null if the token is missing/invalid/expired. */
export function verifySession(token: string | undefined | null): Session | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret(), { issuer: "vendopos" });
    if (typeof decoded !== "object" || decoded === null) return null;
    const d = decoded as Record<string, unknown>;
    if (typeof d.userId !== "string" || typeof d.role !== "string") return null;
    // Decode the impersonator claim only when it's fully well-formed; a partial
    // or malformed shape is dropped rather than trusted.
    let impersonator: Session["impersonator"];
    const imp = d.impersonator;
    if (imp && typeof imp === "object") {
      const i = imp as Record<string, unknown>;
      if (typeof i.userId === "string" && typeof i.email === "string" && typeof i.name === "string") {
        impersonator = { userId: i.userId, email: i.email, name: i.name };
      }
    }
    return {
      userId: d.userId,
      tenantId: (d.tenantId as string | null) ?? null,
      role: d.role as Session["role"],
      email: String(d.email ?? ""),
      name: String(d.name ?? ""),
      ...(typeof d.sid === "string" ? { sid: d.sid } : {}),
      ...(impersonator ? { impersonator } : {}),
    };
  } catch {
    return null;
  }
}

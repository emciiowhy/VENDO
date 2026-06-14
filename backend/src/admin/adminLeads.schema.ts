import { z } from "zod";

/**
 * Validation for the Super Admin Leads pipeline.
 *
 * `status` mirrors the DB CHECK. The provisioning payload is what the
 * Provisioning Drawer submits when approving a lead → tenant.
 */
export type LeadStatus = "PENDING_DEMO" | "APPROVED" | "REJECTED";

/** Plans map to the lowercase tenants.plan CHECK ('starter'|'business'|'enterprise'). */
export const PLANS = ["starter", "business", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

/** Normalise any string to a URL-safe, lowercase, hyphenated slug. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const provisionSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required.").max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Store ID must be at least 2 characters.")
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only."),
  plan: z.enum(PLANS, { errorMap: () => ({ message: "Choose a plan." }) }),
  ownerEmail: z.string().trim().toLowerCase().email("Enter a valid email.").max(200),
  ownerName: z.string().trim().min(1, "Owner name is required.").max(120),
  // Optional. If the prospect already set a password with their demo request, the
  // owner is created with it and this can be left blank; supplying one here
  // overrides it. Blank + no lead password → a Google-only owner (the prior
  // behaviour). The Super Admin never has to invent or hand out a password.
  ownerPassword: z
    .string()
    .min(8, "Owner password must be at least 8 characters.")
    .max(100, "Keep the password under 100 characters.")
    .optional()
    .or(z.literal("")),
});

export type ProvisionInput = z.infer<typeof provisionSchema>;

/** API-facing lead shape (camelCase, with the spec's field names). */
export interface AdminLead {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  status: LeadStatus;
  requestedAt: string;
  /** Extra context the landing form captured, surfaced in the drawer. */
  businessType: string | null;
  message: string | null;
  /**
   * True when the prospect set their own owner password on the demo request.
   * The Super Admin drawer uses this to show "owner already set a password" and
   * keep the password field optional. The hash itself is never sent to the client.
   */
  hasOwnerPassword: boolean;
}

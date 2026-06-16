import { z } from "zod";

/**
 * A Lead is a visitor who submitted the "Request a Demo" form but is not yet
 * a Tenant (see CONTEXT.md). This is the only persisted entity introduced by
 * PRD 0001 — the one real seam on the landing page.
 */
export const businessTypes = [
  "Coffee shop / Café",
  "Restaurant / Food service",
  "Retail store (small)",
  "Retail store (medium–large)",
  "Manufacturing / Production",
  "Other",
] as const;

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(120),
  businessName: z.string().trim().min(1, "Business name is required.").max(160),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a valid phone number.")
    .max(40)
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Please enter a valid phone number."),
  businessType: z.enum(businessTypes, {
    errorMap: () => ({ message: "Please select your business type." }),
  }),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  // Optional: a prospect may choose their own owner password with the request,
  // so the Super Admin doesn't have to issue one on approval. Empty string is
  // treated as "not set" (the field is genuinely optional). Stored hashed.
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(100, "Keep your password under 100 characters.")
    .optional()
    .or(z.literal("")),
});

export type LeadInput = z.infer<typeof leadSchema>;

/**
 * The Enterprise concierge intake (POST /api/leads/enterprise). Enterprise never
 * self-serves a trial — it's a high-touch funnel — so this captures the extra
 * operational detail a rep needs to scope the mandatory 1-on-1 consultation and
 * the in-person multi-location rollout: how large the operation is (`locations`)
 * and what they run today (`currentSystem`). Contact basics are shared with the
 * demo lead so the row still slots into the same pipeline.
 */
export const enterpriseIntakeSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(120),
  businessName: z.string().trim().min(1, "Business name is required.").max(160),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a valid phone number.")
    .max(40)
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Please enter a valid phone number."),
  locations: z
    .string()
    .trim()
    .min(1, "Tell us roughly how many locations you run.")
    .max(120),
  currentSystem: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type EnterpriseIntakeInput = z.infer<typeof enterpriseIntakeSchema>;

/**
 * The persisted/returned Lead never carries the password back out — it's write-
 * only (hashed at rest), so the stored record omits it.
 */
export interface Lead extends Omit<LeadInput, "password"> {
  id: string;
  createdAt: string;
}

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
});

export type LeadInput = z.infer<typeof leadSchema>;

export interface Lead extends LeadInput {
  id: string;
  createdAt: string;
}

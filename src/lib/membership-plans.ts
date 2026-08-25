import type { Tier } from "@/lib/tier";

/**
 * What each membership costs and unlocks.
 *
 * Prices are monthly USD. Nothing here charges anyone yet — members pick a
 * plan and it applies immediately; Stripe billing comes later, at which
 * point PLAN_PRICES becomes the display side of the Stripe prices.
 */
export const PLAN_PRICES = {
  free: 0,
  plus: 25,
  /** Charged on top of Plus, not instead of it. */
  transcriptionAddOn: 60,
} as const;

export const TRANSCRIPTION_TOTAL = PLAN_PRICES.plus + PLAN_PRICES.transcriptionAddOn; // 85

export interface PlanFeature {
  label: string;
  detail?: string;
  /** Lowest tier that includes it. */
  tier: Tier;
  /** Only with the transcription add-on. */
  addOnOnly?: boolean;
}

export const FEATURES: PlanFeature[] = [
  {
    label: "Rate calculator",
    detail: "Exhibit G day rates with overtime, meal penalties and premiums",
    tier: "plus",
  },
  {
    label: "Weekly calculator",
    detail: "Weekly contracts, including 6th and 7th day and location weeks",
    tier: "plus",
  },
  {
    label: "Payment tracker",
    detail: "What you are owed, what has been paid, and what is late",
    tier: "plus",
  },
  {
    label: "Residuals tracking",
    detail: "Import your SAG-AFTRA residual statements",
    tier: "plus",
  },
  {
    label: "Upload your Exhibit Gs",
    detail: "Keep every G in one place and transcribe them yourself",
    tier: "plus",
  },
  {
    label: "We transcribe your Exhibit Gs",
    detail: "Send us the photo — we read it, enter it, and calculate it for you",
    tier: "plus",
    addOnOnly: true,
  },
];

export type PlanId = "free" | "plus" | "plus_transcription";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  priceNote?: string;
  tagline: string;
  tier: Tier;
  transcriptionAddOn: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: PLAN_PRICES.free,
    tagline: "Look around. Calculating and tracking need Plus.",
    tier: "free",
    transcriptionAddOn: false,
  },
  {
    id: "plus",
    name: "Plus",
    price: PLAN_PRICES.plus,
    tagline: "Every calculator and tracker, and you do the data entry.",
    tier: "plus",
    transcriptionAddOn: false,
  },
  {
    id: "plus_transcription",
    name: "Plus + Transcription",
    price: TRANSCRIPTION_TOTAL,
    priceNote: `Plus ($${PLAN_PRICES.plus}) plus the transcription service ($${PLAN_PRICES.transcriptionAddOn})`,
    tagline: "Hand us the photo of your G and we do the rest.",
    tier: "plus",
    transcriptionAddOn: true,
  },
];

export function planFor(tier: Tier, transcriptionAddOn: boolean): PlanId {
  if (tier === "plus" && transcriptionAddOn) return "plus_transcription";
  if (tier === "plus" || tier === "standard") return "plus";
  return "free";
}

export function findPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

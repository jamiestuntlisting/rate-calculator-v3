import type { Tier } from "@/lib/tier";

/**
 * What each membership costs and unlocks.
 *
 * Prices are monthly USD except `perExhibitG`, which is charged per Exhibit
 * G we transcribe. Nothing here charges anyone yet — members pick a plan and
 * it applies immediately; Stripe billing comes later, at which point these
 * become the display side of the Stripe prices.
 */
export const PLAN_PRICES = {
  free: 0,
  plus: 25,
  /** Unlimited transcription, charged on top of Plus, not instead of it. */
  transcriptionAddOn: 60,
  /** Pay as you go, for performers with only the occasional G. */
  perExhibitG: 15,
} as const;

/** What the Plus + Transcription membership bills at in total. */
export const TRANSCRIPTION_TOTAL =
  PLAN_PRICES.plus + PLAN_PRICES.transcriptionAddOn; // 85

/** How a member pays for us transcribing their Exhibit Gs. */
export type TranscriptionBilling = "monthly" | "per_g" | null;

export interface PlanFeature {
  label: string;
  detail?: string;
  /** Lowest tier that includes it. */
  tier: Tier;
  /** Only when we do the transcribing. */
  transcriptionOnly?: boolean;
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
    transcriptionOnly: true,
  },
];

export type PlanId = "free" | "plus" | "plus_per_g" | "plus_transcription";

export interface Plan {
  id: PlanId;
  name: string;
  /** Recurring monthly price. */
  price: number;
  /** Charged per Exhibit G on top of `price`, when the plan works that way. */
  perGPrice?: number;
  priceNote?: string;
  tagline: string;
  tier: Tier;
  transcription: TranscriptionBilling;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: PLAN_PRICES.free,
    tagline: "Look around. Calculating and tracking need Plus.",
    tier: "free",
    transcription: null,
  },
  {
    id: "plus",
    name: "Plus",
    price: PLAN_PRICES.plus,
    tagline: "Every calculator and tracker, and you do the data entry.",
    tier: "plus",
    transcription: null,
  },
  {
    id: "plus_per_g",
    name: "Plus + Pay per G",
    price: PLAN_PRICES.plus,
    perGPrice: PLAN_PRICES.perExhibitG,
    priceNote: `Plus ($${PLAN_PRICES.plus}) and $${PLAN_PRICES.perExhibitG} for each Exhibit G we transcribe`,
    tagline: "For the occasional G — pay only for the ones you send us.",
    tier: "plus",
    transcription: "per_g",
  },
  {
    id: "plus_transcription",
    name: "Plus + Transcription",
    price: TRANSCRIPTION_TOTAL,
    priceNote: `Plus ($${PLAN_PRICES.plus}) plus the transcription service ($${PLAN_PRICES.transcriptionAddOn})`,
    tagline: "Hand us every G and we do the rest. No per-G charges.",
    tier: "plus",
    transcription: "monthly",
  },
];

/** The number of Gs at which the monthly service costs less than per-G. */
export const PER_G_BREAK_EVEN = Math.ceil(
  PLAN_PRICES.transcriptionAddOn / PLAN_PRICES.perExhibitG
); // 4

export function planFor(
  tier: Tier,
  transcription: TranscriptionBilling
): PlanId {
  const paid = tier === "plus" || tier === "standard";
  if (!paid) return "free";
  if (transcription === "monthly") return "plus_transcription";
  if (transcription === "per_g") return "plus_per_g";
  return "plus";
}

export function findPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** Does this plan mean we transcribe for them? */
export function hasTranscriptionService(id: PlanId): boolean {
  return findPlan(id).transcription !== null;
}

import type { Tier } from "@/lib/tier";

/**
 * What each membership costs and unlocks.
 *
 * Prices are monthly USD except `perExhibitG`, which is charged per Exhibit
 * G we transcribe past a plan's included credits. Yearly prices are
 * stated per plan, not derived: roughly ten months for the price of
 * twelve, with Max at a flat $999. Nothing here charges anyone yet
 * — members pick a plan and it applies immediately; Stripe billing comes
 * later, at which point these become the display side of the Stripe prices.
 */
export const PLAN_PRICES = {
  free: 0,
  plus: 25,
  /** Bookkeeper Plus: Plus, with ten transcription credits a month. */
  bookkeeperPlus: 40,
  /** Max: hand us every G, unlimited transcription. */
  max: 100,
  /** Per Exhibit G past the included credits. */
  perExhibitG: 2,
} as const;

export const YEARLY_PRICES = {
  free: 0,
  plus: 250,
  bookkeeperPlus: 400,
  max: 999,
} as const;

/** Gs transcribed each month inside Bookkeeper Plus before per-G pricing. */
export const BOOKKEEPER_PLUS_CREDITS = 10;

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
    label: "Store your Exhibit Gs & paperwork",
    detail: "Upload every G, contract and call sheet and keep them in one place",
    tier: "free",
  },
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
    label: "We transcribe your Exhibit Gs",
    detail: "Send us the photo — we read it, enter it, and calculate it for you",
    tier: "plus",
    transcriptionOnly: true,
  },
];

/**
 * The stored ids predate the current names — "plus_per_g" is Bookkeeper
 * Plus and "plus_transcription" is Max — and stay as they are because
 * they ride member records.
 */
export type PlanId = "free" | "plus" | "plus_per_g" | "plus_transcription";

export interface Plan {
  id: PlanId;
  name: string;
  /** Recurring monthly price. */
  price: number;
  /** Recurring yearly price — ten months for the price of twelve. */
  yearlyPrice: number;
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
    yearlyPrice: YEARLY_PRICES.free,
    tagline: "Store your Exhibit Gs and paperwork. Calculating and tracking need Plus.",
    tier: "free",
    transcription: null,
  },
  {
    id: "plus",
    name: "Plus",
    price: PLAN_PRICES.plus,
    yearlyPrice: YEARLY_PRICES.plus,
    tagline: "Every calculator and tracker, and you do the data entry.",
    tier: "plus",
    transcription: null,
  },
  {
    id: "plus_per_g",
    name: "Bookkeeper Plus",
    price: PLAN_PRICES.bookkeeperPlus,
    perGPrice: PLAN_PRICES.perExhibitG,
    priceNote: `${BOOKKEEPER_PLUS_CREDITS} transcription credits a month included, then $${PLAN_PRICES.perExhibitG} per Exhibit G`,
    yearlyPrice: YEARLY_PRICES.bookkeeperPlus,
    tagline: "Everything in Plus, and we transcribe your Gs — ten a month on us.",
    tier: "plus",
    transcription: "per_g",
  },
  {
    id: "plus_transcription",
    name: "Max",
    price: PLAN_PRICES.max,
    yearlyPrice: YEARLY_PRICES.max,
    tagline: "Hand us every G and we do the rest. No per-G charges, no limits.",
    tier: "plus",
    transcription: "monthly",
  },
];

/** The Gs per month at which Max costs less than Bookkeeper Plus. */
export const PER_G_BREAK_EVEN =
  BOOKKEEPER_PLUS_CREDITS +
  Math.ceil(
    (PLAN_PRICES.max - PLAN_PRICES.bookkeeperPlus) / PLAN_PRICES.perExhibitG
  );

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

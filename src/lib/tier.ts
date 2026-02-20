export type Tier = "free" | "standard" | "plus";

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  standard: "Standard",
  plus: "Plus",
};

export type Feature =
  | "rate_calculator"
  | "calculation_details"
  | "save_data"
  | "save_draft"
  | "attachment_only"
  | "payment_tracker"
  | "upload_photos"
  | "upload_additional"
  | "calendar_integration"
  | "email_accounting"
  | "payment_reminders"
  | "incomplete_reminders"
  | "pay_cycle_reminders"
  | "edit_recalculate"
  | "data_persistence";

/**
 * All features are now unlocked for all tiers.
 */
export function hasFeature(_tier: Tier, _feature: Feature): boolean {
  return true;
}

export function getRequiredTier(_feature: Feature): Tier {
  return "free";
}

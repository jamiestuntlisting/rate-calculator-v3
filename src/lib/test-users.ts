/**
 * Test users — accounts that see features under test before they
 * launch. Distinct from admins, who see the admin pages: a tester is a
 * performer whose own days exercise a new feature, and only theirs.
 * Kept free of server-only imports so client components can ask.
 */
export const TEST_USER_EMAILS = ["jamesdunnauthor@gmail.com"];

export function isTestUser(email: string | null | undefined): boolean {
  return TEST_USER_EMAILS.includes((email ?? "").toLowerCase().trim());
}

/**
 * Whether a G that lands in this account is read by Claude on arrival
 * (src/lib/g-reader). The feature under test; testers only.
 */
export function autoReadsExhibitG(email: string | null | undefined): boolean {
  return isTestUser(email);
}

/**
 * Test users: performers whose own days exercise a feature before it
 * launches. Distinct from admins, who see the admin tools; a tester
 * sees the features under test on their own account. Two sources
 * agree: this seed list, and the `users.tester` flag an admin sets on
 * Admin → Members. Kept free of server imports so client code can read
 * the seed list.
 */
export const TEST_USER_EMAILS = [
  "jamesdunnauthor@gmail.com",
  "james.northrup@gmail.com",
];

/** Whether an email is on the seed list (the flag is checked elsewhere). */
export function isTestUser(email: string | null | undefined): boolean {
  return TEST_USER_EMAILS.includes((email ?? "").toLowerCase().trim());
}

/** A user row's tester status: the seed list or the flag. */
export function isTester(user: { email: string; tester?: number | boolean | null }): boolean {
  return isTestUser(user.email) || !!user.tester;
}

/**
 * Which testers get Claude reading their Exhibit Gs as they land.
 * Today every tester does; kept as its own question so a feature can be
 * gated more narrowly later.
 */
export function autoReadsExhibitG(user: { email: string; tester?: number | boolean | null }): boolean {
  return isTester(user);
}

export const ADMIN_EMAILS = [
  "james.northrup@gmail.com",
  "warren.hull.stunts@gmail.com",
] as const;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}

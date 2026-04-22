// Admin emails — these users get admin role.
// Kept in its own file (no server-only imports) so client components
// can import isAdminEmail without pulling in next/headers.
export const ADMIN_EMAILS = [
  "james.northrup@gmail.com",
  "jamie@stuntlisting.com",
  "warrenhullstunts@gmail.com",
  "warren.hull.stunts@gmail.com",
  "warren@stuntlisting.com",
  "greg@stuntlisting.com",
  "info@stuntlisting.com",
  "thestuntassistant@gmail.com",
  "derric@stuntlisting.com",
];

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

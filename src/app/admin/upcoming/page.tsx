import { redirect } from "next/navigation";

/**
 * Upcoming merged into Tasks: two lists of what is coming next were the
 * same list wearing different clothes. The planned features live in the
 * tasks table now (owner james, blocked on their providers), and the old
 * address keeps working for anyone who bookmarked it.
 */
export default function UpcomingRedirect() {
  redirect("/admin/tasks");
}

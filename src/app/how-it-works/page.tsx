import Link from "next/link";
import { HowItWorksFlow } from "@/components/how-it-works/flow";
import { Editable, EditablePage } from "@/components/shared/editable-page";

export const metadata = {
  title: "How the Bookkeeper works",
};

/**
 * What the Bookkeeper does, for someone who has not signed in yet.
 *
 * This was a diagram with the whole flow on screen at once. It read well
 * and told you nothing about your own situation, because the interesting
 * part of the process is the branches — who transcribes the G, and whether
 * the stub was right — and a static picture has to show both sides of both
 * at the same time. So it is walked now: one step, a real choice, the next
 * step follows. The machinery is in `HowItWorksFlow`.
 */
export default function HowItWorksPage() {
  return (
    <EditablePage page="how-it-works">
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          <Editable k="hero.title" d="What this actually does" />
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          <Editable
            k="hero.body"
            d="It works out what you are owed for a day, checks it against what you were paid, and writes the email when those two do not match. Walk through it — the numbers and the email below are the real ones."
          />
        </p>
      </div>

      <HowItWorksFlow />

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        <Link
          href="/login"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
        <span className="text-sm text-muted-foreground">
          Uses your StuntListing account.
        </span>
      </div>
    </div>
    </EditablePage>
  );
}

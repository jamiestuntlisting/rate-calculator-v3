import Link from "next/link";
import { Camera, Keyboard, Receipt } from "lucide-react";

export const metadata = {
  title: "How the Bookkeeper works",
};

/**
 * What the Bookkeeper does, for someone who has not signed in yet.
 *
 * The diagram is the point of the page. A four-box flow would be the easy
 * drawing, but it would hide the actual mechanism: two separate things come
 * in — what you worked and what you were paid — and the product is the
 * comparison between them. So the picture shows them converging.
 */

const STEPS = [
  {
    n: 1,
    title: "Get the day in",
    body: "Photograph your Exhibit G, or type the times in yourself. Either way it lands in your tracker as a work day.",
  },
  {
    n: 2,
    title: "We work out what you are owed",
    body: "Day rate, the overtime tiers, meal penalties, sixth and seventh day, and a second day rate for every extra contract you worked.",
  },
  {
    n: 3,
    title: "Add the pay stub",
    body: "What actually landed, against the day it was for.",
  },
  {
    n: 4,
    title: "See the difference",
    body: "Paid correctly, paid short, or still waiting — and which days are late enough to chase.",
  },
];

const OUTCOMES = [
  { label: "Paid correctly", tone: "border-emerald-500/40 text-emerald-300" },
  { label: "Paid short", tone: "border-amber-500/40 text-amber-300" },
  { label: "Still owed", tone: "border-rose-500/40 text-rose-300" },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          What the Bookkeeper does
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          It works out what a day owed you, then checks that against what you
          were actually paid.
        </p>
      </div>

      {/* The mechanism: two things come in, and the answer is the gap. */}
      <div className="rounded-xl border border-border p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <Source
            icon={<Camera className="h-5 w-5" />}
            title="Your Exhibit G"
            detail="The day you worked"
          />
          <Source
            icon={<Receipt className="h-5 w-5" />}
            title="Your pay stub"
            detail="What they sent"
          />
        </div>

        {/* Two lines meeting one. Stretched to the container, so the stroke
            is pinned to a pixel rather than scaling with it. */}
        <svg
          viewBox="0 0 100 28"
          preserveAspectRatio="none"
          className="w-full h-8 text-border"
          aria-hidden="true"
        >
          <path
            d="M25 0 V12 H50 V28 M75 0 V12 H50"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Owed against paid
          </p>
          <p className="text-lg font-semibold mt-1">
            The difference, day by day
          </p>
        </div>

        <svg
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
          className="w-full h-6 text-border"
          aria-hidden="true"
        >
          <path
            d="M50 0 V10 H16 V20 M50 10 H84 V20 M50 10 V20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map((outcome) => (
            <div
              key={outcome.label}
              className={`rounded-lg border px-2 py-3 text-center text-xs font-medium leading-tight ${outcome.tone}`}
            >
              {outcome.label}
            </div>
          ))}
        </div>
      </div>

      <ol className="space-y-4">
        {STEPS.map((step) => (
          <li key={step.n} className="flex gap-4">
            <span className="shrink-0 h-8 w-8 rounded-full border border-border flex items-center justify-center text-sm font-semibold">
              {step.n}
            </span>
            <div className="min-w-0 pt-1">
              <h2 className="font-semibold">{step.title}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold text-lg">Two ways in</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Way
            icon={<Camera className="h-5 w-5" />}
            title="Send us the G"
            body="Photograph it on set. We read it, enter it, and calculate it for you."
          />
          <Way
            icon={<Keyboard className="h-5 w-5" />}
            title="Do it yourself"
            body="Type the call, the meals and the wrap. The rate follows as you go."
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pb-4">
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
  );
}

function Source({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3 text-center">
      <span className="inline-flex text-muted-foreground">{icon}</span>
      <p className="text-sm font-medium mt-1 leading-tight">{title}</p>
      <p className="text-xs text-muted-foreground leading-tight">{detail}</p>
    </div>
  );
}

function Way({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{body}</p>
    </div>
  );
}

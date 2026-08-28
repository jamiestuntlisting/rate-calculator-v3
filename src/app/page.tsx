import Link from "next/link";
import { ExhibitGForm } from "@/components/calculator/exhibit-g-form";

export default function HomePage() {
  return (
    <div>
      {/* Title and the way into commercials and music videos share one line. */}
      <div className="max-w-3xl mx-auto px-4 mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Log Work</h1>
        <Link
          href="/other-work"
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Other Work
        </Link>
      </div>

      <ExhibitGForm />
    </div>
  );
}

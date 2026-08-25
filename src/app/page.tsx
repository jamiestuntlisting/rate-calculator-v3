import Link from "next/link";
import { ExhibitGForm } from "@/components/calculator/exhibit-g-form";

export default function HomePage() {
  return (
    <div>
      <div className="max-w-3xl mx-auto mb-6 flex justify-end px-4">
        {/* The only way into the non-SAG calculator. */}
        <Link
          href="/other-work"
          className="rounded-lg border border-border px-4 py-2 text-base font-medium hover:bg-accent"
        >
          Non-SAG Calculator
        </Link>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Rate Calculator</h1>
      </div>

      <ExhibitGForm />
    </div>
  );
}

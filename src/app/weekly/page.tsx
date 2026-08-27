import { WeeklyForm } from "@/components/calculator/weekly-form";

export default function WeeklyPage() {
  return (
    <div>
      <div className="max-w-3xl mx-auto px-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Weekly Calculator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick the days a weekly covers. Each week is worked out on its own.
        </p>
      </div>

      <WeeklyForm />
    </div>
  );
}

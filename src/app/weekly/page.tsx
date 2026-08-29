import { WeeklyForm } from "@/components/calculator/weekly-form";

export default function WeeklyPage() {
  return (
    <div>
      {/* The heading lives in the form: it flips with the Weekly / 3 Day
          toggle beside it. */}
      <WeeklyForm />
    </div>
  );
}

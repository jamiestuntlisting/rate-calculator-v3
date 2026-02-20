import { ExhibitGForm } from "@/components/calculator/exhibit-g-form";

export default function HomePage() {
  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Rate Calculator
        </h1>
      </div>
      <ExhibitGForm />
    </div>
  );
}

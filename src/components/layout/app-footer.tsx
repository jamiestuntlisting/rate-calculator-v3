import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="border-t border-border/50 py-4 mt-auto">
      <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
        <p>
          This tool provides estimates based on SAG-AFTRA Theatrical Basic
          Agreement rates. Always verify calculations with your union contract
          and payroll department.
        </p>
        <p className="mt-1">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
        </p>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — StuntListing Bookkeeper",
};

/**
 * Public terms of service. The "Text messages" section exists to satisfy
 * carrier (A2P 10DLC) review of the Exhibit G text-in program and must
 * keep: the program name and description, "message and data rates may
 * apply", message frequency, a support contact, and bolded HELP / STOP
 * instructions. Twilio's default opt-out handling answers STOP/START/HELP
 * on the number itself, so the promises here are kept by the platform.
 */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        StuntListing Bookkeeper · Effective September 1, 2026
      </p>

      <Section title="The service">
        <p>
          StuntListing Bookkeeper is a bookkeeping tool for stunt performers.
          It keeps your work records, stores the documents you upload, and
          calculates the pay you can expect under SAG-AFTRA agreements. Every
          figure it produces is an <strong>estimate</strong> based on
          published agreement rates: always verify calculations with your
          union contract and the production&apos;s payroll department before
          relying on them. Using the service requires a StuntListing account.
        </p>
      </Section>

      <Section title="Text messages (SMS/MMS)">
        <p>
          <strong>Program:</strong> StuntListing Bookkeeper Exhibit G intake.
          Members can text photos of their own work documents (such as
          SAG-AFTRA Exhibit G time sheets) to our intake number, and the
          service files each photo to that member&apos;s account and sends
          one confirmation reply per message received.
        </p>
        <p>
          <strong>Opt-in:</strong> you join by signing in and entering your
          mobile number on the Preferences page of your account. We only
          reply to messages you send first — the service sends no marketing
          and no recurring messages, and never texts you unprompted.
        </p>
        <p>
          <strong>Message frequency</strong> varies with your use: one reply
          for each message you send. <strong>Message and data rates may
          apply.</strong>
        </p>
        <p>
          <strong>Opt out:</strong> reply <strong>STOP</strong> to any
          message to stop receiving texts, or remove your mobile number on
          the Preferences page. Reply <strong>START</strong> to rejoin.
        </p>
        <p>
          <strong>Help:</strong> reply <strong>HELP</strong> to any message,
          or email{" "}
          <a
            href="mailto:actorsbookkeeper@gmail.com"
            className="underline underline-offset-2"
          >
            actorsbookkeeper@gmail.com
          </a>
          .
        </p>
        <p>
          Wireless carriers are not liable for delayed or undelivered
          messages.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          The documents and records you add stay yours. You give us only the
          rights needed to run the service — storing your uploads, reading
          the times off them, and calculating pay from them, for you. Upload
          only documents that are yours to keep: your own time sheets, pay
          stubs, and work records.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Don&apos;t use the service to store content you have no right to,
          to access another member&apos;s records, or to disrupt the service.
          We can suspend accounts that do.
        </p>
      </Section>

      <Section title="Disclaimer and liability">
        <p>
          The service is provided as-is. Calculations are estimates, not
          payroll, legal, or tax advice, and we are not liable for decisions
          made on them or for indirect damages arising from use of the
          service.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms; material changes will be posted on this
          page with a new effective date. Continuing to use the service after
          a change means you accept it.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms:{" "}
          <a
            href="mailto:actorsbookkeeper@gmail.com"
            className="underline underline-offset-2"
          >
            actorsbookkeeper@gmail.com
          </a>
          .
        </p>
      </Section>
    </div>
  );
}

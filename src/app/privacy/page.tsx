import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — StuntListing Bookkeeper",
};

/**
 * Public privacy policy. The "Text messaging" section exists to satisfy
 * carrier (A2P 10DLC) review of the Exhibit G text-in program and must
 * keep the no-sharing clause: mobile information is never shared with
 * third parties or affiliates for marketing, and opt-in data goes only to
 * the messaging platform that delivers the messages.
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

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        StuntListing Bookkeeper · Effective September 1, 2026
      </p>

      <Section title="What we collect">
        <p>
          Your StuntListing account details (name, email address, membership
          tier) when you sign in; the work records you enter; the documents
          you upload, email in, or text in (time sheets, pay stubs, checks);
          and your mobile number if you choose to provide it for texting in
          documents.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          Only to run the service for you: keeping your records, reading the
          times off your documents, calculating the pay you can expect,
          matching photos you text to your own account, and sending the one
          confirmation reply when you text a document in. We don&apos;t use
          your information for advertising, and we don&apos;t sell it.
        </p>
      </Section>

      <Section title="Text messaging">
        <p>
          If you add your mobile number, it is used solely to match messages
          you send to your account and to send you one confirmation reply
          per message you send.{" "}
          <strong>
            No mobile information will be shared with third parties or
            affiliates for marketing or promotional purposes.
          </strong>{" "}
          Text messaging originator opt-in data and consent are not shared
          with any third parties, excluding the messaging platform provider
          used to deliver the messages. You can remove your number at any
          time on the Preferences page, or reply STOP to any message.
        </p>
      </Section>

      <Section title="Who we share with">
        <p>
          Only the service providers that run the product: our hosting and
          storage provider (Cloudflare), our messaging provider (Twilio) for
          texts you send and their replies, and StuntListing itself for sign
          in and membership. Each receives only what it needs to do its job.
          We may also disclose information if the law requires it. We never
          sell personal information.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Your records and documents are kept while your account is active so
          your bookkeeping history stays intact. To have your data deleted,
          email{" "}
          <a
            href="mailto:actorsbookkeeper@gmail.com"
            className="underline underline-offset-2"
          >
            actorsbookkeeper@gmail.com
          </a>{" "}
          from your account email.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data moves over encrypted connections and is stored with access
          limited to your own signed-in account. No method of storage is
          perfectly secure, but your documents are visible only to you and to
          site administration.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          Material changes to this policy will be posted here with a new
          effective date. Questions:{" "}
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

import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — RIVEN",
  description: "How RIVEN collects, uses, and protects your information.",
};

/**
 * Public privacy policy. Required for the App Store / Play Store listing and
 * good practice generally. Static content; lives in the public route allowlist
 * (middleware.ts). Written plainly, in RIVEN's calm voice — no legalese wall.
 */
export default function PrivacyPage() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-14 pb-24">
      <header className="space-y-2 mb-section-gap">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          RIVEN
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Privacy Policy
        </h1>
        <p className="font-body text-label-md text-on-surface-variant">Last updated: June 2026</p>
      </header>

      <div className="space-y-8 font-body text-body-md text-charcoal leading-relaxed">
        <Section title="The short version">
          RIVEN is a weight-loss and body-recomposition coaching app. We collect
          only what we need to coach you — your account details, the body and
          meal info you choose to share, and basic usage data — and we never sell
          your personal information. That&apos;s the whole spirit of this page.
        </Section>

        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Account:</strong> your email and login, via our auth provider (Clerk).</li>
            <li><strong>Profile &amp; health inputs you provide:</strong> age, height, weight, goals, activity level, and cycle stage — used to build your plan.</li>
            <li><strong>Meal &amp; check-in data:</strong> meals you log (text or photo), weights, and check-in answers.</li>
            <li><strong>Usage data:</strong> pages viewed and basic interactions, via privacy-respecting analytics (PostHog, Plausible), to improve the app.</li>
            <li><strong>Payment:</strong> handled entirely by Stripe. We never see or store your card number.</li>
          </ul>
        </Section>

        <Section title="How we use it">
          To create and adjust your coaching plan, estimate your meals&apos; nutrition,
          send you check-ins and reminders, process your subscription, and improve
          RIVEN. Meal descriptions and photos may be processed by our AI provider
          (Anthropic) to estimate nutrition and coach you — they are not used to
          train external models.
        </Section>

        <Section title="Who we share it with">
          Only the service providers that run RIVEN: Clerk (login), Stripe
          (payments), our hosting/database (Railway), analytics (PostHog,
          Plausible), and AI processing (Anthropic). Each handles your data under
          their own terms. <strong>We do not sell your personal information.</strong>
        </Section>

        <Section title="Your choices">
          You can edit your profile, stop logging anytime, and cancel your
          subscription from your billing portal. To access, correct, or delete
          your data, email us (below) and we&apos;ll handle it.
        </Section>

        <Section title="Data retention &amp; security">
          We keep your data while your account is active and delete it on request
          or a reasonable time after you cancel. Access is restricted to your own
          account — your data is never visible to other members.
        </Section>

        <Section title="Children">
          RIVEN is for adults. It is not directed to anyone under 18, and we don&apos;t
          knowingly collect data from minors.
        </Section>

        <Section title="Changes">
          If this policy changes, we&apos;ll update this page and the date above.
        </Section>

        <Section title="Contact">
          Questions about your privacy? Email{" "}
          <a href="mailto:lamper.2019@gmail.com" className="underline underline-offset-4 text-charcoal">
            lamper.2019@gmail.com
          </a>
          .
        </Section>
      </div>

      <div className="mt-section-gap">
        <Link href="/" className="font-body text-label-md text-on-surface-variant hover:text-charcoal underline underline-offset-4">
          ← Back to RIVEN
        </Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-headline-md text-charcoal">{title}</h2>
      <div className="text-on-surface-variant">{children}</div>
    </section>
  );
}

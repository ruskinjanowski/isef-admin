import type { Metadata } from "next";
import Image from "next/image";

// Public privacy policy. Lives outside the (app) route group so it has no
// sidebar and bypasses the approved-only gate — it must be reachable without a
// login (Meta requires a publicly resolvable privacy policy URL to publish the
// WhatsApp app). Plain static content; review the wording before relying on it
// legally.
export const metadata: Metadata = {
  title: "Privacy Policy — ISEF",
  description: "How ISEF handles the personal information of teachers we work with.",
};

const LAST_UPDATED = "26 June 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <article className="mx-auto w-full max-w-2xl space-y-8">
        <header className="space-y-4">
          <Image
            src="/isef-logo.png"
            alt="ISEF"
            width={614}
            height={192}
            priority
            className="h-10 w-auto"
          />
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">
              Last updated {LAST_UPDATED}
            </p>
          </div>
        </header>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            This policy explains how ISEF collects, uses, and protects the
            personal information of the teachers we work with. It applies to the
            information you share with us when you sign up and while we coordinate
            your placement and onboarding, including any messages you exchange with
            our WhatsApp assistant.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">Who we are</h2>
            <p>
              ISEF recruits and supports teachers. We work directly with teachers
              who have applied to or registered with us, helping them through the
              recruitment, placement, and onboarding process.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Information we collect
            </h2>
            <p>We collect information that you provide to us, including:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                Contact and identity details you give when you sign up, such as
                your name, email address, and phone number.
              </li>
              <li>
                Professional information relevant to teaching placements, such as
                your CV, qualifications, experience, and a photo.
              </li>
              <li>
                Messages you send to, and that we send to you, through our WhatsApp
                assistant, along with the WhatsApp phone number you contact us from.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              How we use your information
            </h2>
            <p>We use your information to:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                Manage your application and coordinate your recruitment, placement,
                and onboarding.
              </li>
              <li>
                Communicate with you about your application and answer your
                questions, including through our WhatsApp assistant.
              </li>
              <li>Keep accurate records and improve how we support teachers.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Our WhatsApp assistant
            </h2>
            <p>
              We offer an automated WhatsApp assistant that answers common
              questions about working with us. When you message it, your messages
              are processed to generate a helpful reply. The assistant only answers
              from information we have prepared in advance; when it cannot help, it
              refers you to a member of our team. If you would prefer not to use the
              assistant, you can ask to speak with a person at any time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Who we share it with
            </h2>
            <p>
              We do not sell your information. We share it only as needed to provide
              our service, including with service providers who help us operate:
              WhatsApp (Meta) for messaging, our hosting and database providers, and
              the AI provider that powers our assistant&apos;s replies. These
              providers process information on our behalf and are not permitted to
              use it for their own purposes. We may also share information where the
              law requires it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              How long we keep it
            </h2>
            <p>
              We keep your information for as long as we are working with you and as
              needed to manage our relationship and meet our legal and operational
              obligations. When it is no longer needed, we remove it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">Your choices</h2>
            <p>
              You can ask us to access, correct, or delete the personal information
              we hold about you, or ask questions about how we use it. Contact us
              using the details below and we will help.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">Contact us</h2>
            <p>
              If you have any questions about this policy or your information, please
              get in touch with your ISEF contact.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

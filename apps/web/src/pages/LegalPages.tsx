import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "../components/Logo";
import { Link } from "../lib/router";

const CONTACT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || null;
const LAST_UPDATED = "19 November 2026";

const Contact = () =>
  CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-rr-on-canvas underline underline-offset-4">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <>the clinic you are a patient of</>
  );

const LegalLayout = ({ title, intro, children }: { title: string; intro: string; children: ReactNode }) => (
  <div className="min-h-screen">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
      <Link href="/" aria-label="Revenue Recovery home">
        <Logo />
      </Link>
      <Link href="/" className="inline-flex items-center gap-1.5 text-rr-on-canvas-soft hover:text-rr-on-canvas">
        <ArrowLeft size={17} aria-hidden /> Home
      </Link>
    </header>
    <main className="mx-auto max-w-3xl px-5 pt-10 pb-24">
      <p className="text-sm text-rr-on-canvas-soft">Last updated {LAST_UPDATED}</p>
      <h1 className="mt-3 text-5xl font-light tracking-tight">{title}</h1>
      <p className="mt-5 text-xl font-light text-pretty text-rr-on-canvas-soft">{intro}</p>
      <div className="mt-12 flex flex-col gap-10 text-[17px] leading-relaxed text-rr-on-canvas-soft [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-rr-on-canvas [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </main>
  </div>
);

export const PrivacyPage = () => (
  <LegalLayout
    title="Privacy policy"
    intro="Revenue Recovery helps dental clinics remind their own patients about appointments and treatment. This page explains what information is used, why, and the choices patients and clinics have."
  >
    <section>
      <h2>Who is responsible</h2>
      <p>
        Each clinic decides which patients to add and what to send them, so the clinic is responsible for its patients&apos;
        information (the data fiduciary under India&apos;s Digital Personal Data Protection Act, 2023). Revenue Recovery
        processes that information on the clinic&apos;s behalf and only for the purposes below.
      </p>
    </section>
    <section>
      <h2>What we store</h2>
      <ul>
        <li>Patient details the clinic enters: name, phone number, optional email and notes.</li>
        <li>Appointments, planned treatment and their expected value.</li>
        <li>WhatsApp messages sent to and received from patients, and whether they were delivered or read.</li>
        <li>Whether a patient agreed to WhatsApp reminders, or asked to stop.</li>
        <li>For clinic staff: name, email, role and a sign-in password (stored only as a secure hash).</li>
      </ul>
    </section>
    <section>
      <h2>How it is used</h2>
      <ul>
        <li>To find patients who may need a reminder or a call, and to show them to the clinic&apos;s team.</li>
        <li>To send appointment confirmations, follow-ups and next-visit reminders on WhatsApp.</li>
        <li>To show the clinic which bookings came back after a reminder.</li>
      </ul>
      <p className="mt-3">We never sell personal information and never use it for advertising.</p>
    </section>
    <section>
      <h2>Smart suggestions</h2>
      <p>
        Unless a clinic turns smart suggestions off, the text of incoming patient messages and the patient&apos;s first name are sent to
        Google&apos;s Gemini service to work out what the patient wants and to draft a reply. Phone numbers are never included. A person on the
        clinic&apos;s team reviews suggestions before anything is sent. Clinics can turn this off at any time in Settings.
      </p>
    </section>
    <section>
      <h2>Who else processes data</h2>
      <ul>
        <li>Supabase: secure database and sign-in.</li>
        <li>Cloudflare: hosting of the website and the reminder service.</li>
        <li>Meta (WhatsApp Business Platform): delivering WhatsApp messages.</li>
        <li>Google (Gemini): smart suggestions, unless the clinic turns them off.</li>
      </ul>
    </section>
    <section>
      <h2>Patients&apos; choices</h2>
      <ul>
        <li>Reply STOP to any message and no further WhatsApp messages will be sent.</li>
        <li>Ask the clinic to see, correct or delete your information. The clinic can erase your messages in one step.</li>
        <li>Reminders are never sent at night, and at most a few times a week.</li>
      </ul>
    </section>
    <section>
      <h2>How long we keep it</h2>
      <p>
        Message text is deleted automatically after the period the clinic chooses (one year by default). Patient records stay
        until the clinic deletes them. A record that someone asked to stop messages is kept so we can keep honouring it.
      </p>
    </section>
    <section>
      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Every clinic is kept separate at the database level, so staff can only ever
        see their own clinic&apos;s patients.
      </p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>
        Questions or requests about your information: contact <Contact />.
      </p>
    </section>
  </LegalLayout>
);

export const TermsPage = () => (
  <LegalLayout
    title="Terms of use"
    intro="These terms apply to clinics and their staff who use Revenue Recovery. By creating an account you agree to them."
  >
    <section>
      <h2>Your account</h2>
      <ul>
        <li>Keep your password private. You are responsible for what happens under your account.</li>
        <li>Clinic owners decide who joins their team and can remove access at any time.</li>
      </ul>
    </section>
    <section>
      <h2>Messaging patients</h2>
      <ul>
        <li>Only add patients who have agreed to hear from your clinic, and record when they have not.</li>
        <li>Messages must be about the patient&apos;s own care: appointments, treatment and check-ups. No marketing to people who did not ask for it.</li>
        <li>Follow WhatsApp&apos;s Business and Commerce policies. Messages that break them may be blocked by WhatsApp.</li>
        <li>Smart suggestions are drafts. A person on your team is responsible for what is sent. They are not medical advice.</li>
      </ul>
    </section>
    <section>
      <h2>Patient information</h2>
      <p>
        Your clinic remains responsible for its patients&apos; information. We process it only to provide the service, as
        described in the <Link href="/privacy" className="text-rr-on-canvas underline underline-offset-4">privacy policy</Link>.
        You can delete patients and their messages at any time.
      </p>
    </section>
    <section>
      <h2>Results</h2>
      <p>
        Figures such as &quot;won back&quot; bookings are estimates based on bookings made after a reminder or call. They help
        you see what works; they are not financial statements.
      </p>
    </section>
    <section>
      <h2>Availability and changes</h2>
      <p>
        We work to keep the service running and your data safe, but cannot promise it will never be interrupted. We may
        update these terms; we will tell account owners about important changes before they apply.
      </p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>
        Questions about these terms: contact <Contact />.
      </p>
    </section>
  </LegalLayout>
);

export const NotFoundPage = () => (
  <div className="grid min-h-screen place-items-center px-5 text-center">
    <div>
      <Link href="/" aria-label="Revenue Recovery home" className="inline-block">
        <Logo />
      </Link>
      <p className="mt-16 text-8xl font-light tracking-tight text-rr-on-canvas-soft/60">404</p>
      <h1 className="mt-4 text-3xl font-light">This page wandered off.</h1>
      <p className="mt-2 text-rr-on-canvas-soft">Unlike your patients, we can&apos;t send it a reminder.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex h-12 items-center rounded-full bg-rr-surface px-6 font-semibold text-rr-ink hover:bg-white">
          Go home
        </Link>
        <Link href="/app" className="inline-flex h-12 items-center rounded-full border border-rr-canvas-line px-6 hover:bg-white/10">
          Open my clinic
        </Link>
      </div>
    </div>
  </div>
);

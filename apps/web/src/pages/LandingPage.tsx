import { Suspense, lazy, useEffect, useState } from "react";
import {
  ArrowRight,
  BellOff,
  CalendarClock,
  Check,
  Hand,
  LockKeyhole,
  MessageCircleQuestion,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundSearch,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Link } from "../lib/router";

// The 3D "patients coming back" animation loads after the page so the words appear first.
const RecoveryAnimation = lazy(() => import("@dental-os/revenue-recovery/animation"));

export const LandingPage = () => (
  <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(70rem_45rem_at_85%_-10%,rgb(79_165_138/0.22),transparent_60%),radial-gradient(50rem_35rem_at_-10%_40%,rgb(108_156_192/0.12),transparent_60%)]">
    <Header />
    <main>
      <Hero />
      <Leaks />
      <HowItWorks />
      <SmartSuggestions />
      <ResultsBand />
      <Safety />
      <Faq />
      <FinalCall />
    </main>
    <Footer />
  </div>
);

const Header = () => (
  <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6">
    <Link href="/" aria-label="Revenue Recovery home">
      <Logo />
    </Link>
    <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
      <a href="#how" className="hidden rounded-full px-4 py-2 text-rr-on-canvas-soft transition-colors hover:text-rr-on-canvas sm:block">
        How it works
      </a>
      <a href="#safety" className="hidden rounded-full px-4 py-2 text-rr-on-canvas-soft transition-colors hover:text-rr-on-canvas sm:block">
        Privacy
      </a>
      <a href="#faq" className="hidden rounded-full px-4 py-2 text-rr-on-canvas-soft transition-colors hover:text-rr-on-canvas md:block">
        Questions
      </a>
      <Link href="/login" className="rounded-full px-4 py-2 text-rr-on-canvas-soft transition-colors hover:text-rr-on-canvas">
        Sign in
      </Link>
      <Link href="/signup" className="rounded-full bg-rr-surface px-5 py-2.5 font-semibold text-rr-ink transition-colors hover:bg-white">
        Get started
      </Link>
    </nav>
  </header>
);

const Hero = () => (
  <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-8 pb-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:pt-16">
    <div>
      <p className="inline-flex items-center gap-2 rounded-full border border-rr-canvas-line bg-white/5 px-4 py-1.5 text-sm text-rr-on-canvas-soft">
        <Sparkles size={15} aria-hidden /> For dental clinics in India
      </p>
      <h1 className="mt-6 text-5xl leading-[1.04] font-light tracking-tight text-balance sm:text-6xl lg:text-7xl">
        Bring back the patients your clinic is quietly losing.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-pretty text-rr-on-canvas-soft sm:text-xl">
        Unanswered enquiries, appointments nobody confirmed, crowns never booked. Revenue Recovery finds them every few
        minutes and reminds patients on WhatsApp, so your front desk doesn&apos;t have to remember everyone.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="inline-flex h-13 items-center gap-2 rounded-full bg-rr-surface px-7 text-lg font-semibold text-rr-ink transition-colors hover:bg-white"
        >
          Get started <ArrowRight size={19} aria-hidden />
        </Link>
        <a
          href="#how"
          className="inline-flex h-13 items-center rounded-full border border-rr-canvas-line bg-white/5 px-7 text-lg transition-colors hover:bg-white/10"
        >
          See how it works
        </a>
      </div>
    </div>
    <ChatDemo />
  </section>
);

/** One orchestrated moment: the reminder arrives, the patient taps Confirm, the clinic is told. */
const ChatDemo = () => {
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTapped(true), 2300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <figure className="relative mx-auto w-full max-w-md" aria-label="Example: a WhatsApp reminder confirmed by the patient">
      <div className="rounded-[2.25rem] border border-rr-canvas-line bg-rr-canvas-raised/80 p-3 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]">
        <div className="rounded-[1.75rem] bg-[#e7efe9] p-4 pb-10 text-rr-ink sm:p-5 sm:pb-12">
          <div className="flex items-center gap-3 border-b border-rr-line pb-3">
            <span className="grid size-10 place-items-center rounded-full bg-rr-primary text-sm font-bold text-white">SD</span>
            <div>
              <p className="font-semibold">Your dental clinic</p>
              <p className="text-xs text-rr-ink-soft">WhatsApp Business</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="rr-arrive max-w-[88%] rounded-2xl rounded-tl-md bg-white p-3.5 shadow-sm" style={{ animationDelay: "250ms" }}>
              <p className="text-[15px]">
                Hi Ananya, your implant consultation is booked for Friday, 10:30 am. Please tap Confirm, or Reschedule if the
                time no longer works for you.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <span
                  className={`grid h-10 place-items-center rounded-xl border text-sm font-semibold transition-colors duration-300 ${tapped ? "rr-tap border-rr-primary bg-rr-primary text-white" : "border-rr-line text-rr-primary-strong"}`}
                >
                  Confirm
                </span>
                <span className="grid h-10 place-items-center rounded-xl border border-rr-line text-sm font-semibold text-rr-primary-strong">
                  Reschedule
                </span>
              </div>
            </div>
            {tapped && (
              <div className="rr-arrive ml-auto rounded-2xl rounded-tr-md bg-rr-recovered-soft px-3.5 py-2.5 text-[15px]" style={{ animationDelay: "450ms" }}>
                Confirm
              </div>
            )}
          </div>
        </div>
      </div>
      {tapped && (
        <figcaption
          className="rr-arrive absolute -bottom-6 left-1/2 flex w-max max-w-[92%] -translate-x-1/2 items-center gap-2.5 rounded-full bg-rr-surface px-5 py-3 text-rr-ink shadow-[0_20px_40px_-15px_rgb(0_0_0/0.5)]"
          style={{ animationDelay: "1100ms" }}
        >
          <span className="grid size-7 place-items-center rounded-full bg-rr-recovered text-white">
            <Check size={16} aria-hidden />
          </span>
          Appointment confirmed. Nobody had to call.
        </figcaption>
      )}
    </figure>
  );
};

const LEAKS = [
  {
    icon: MessageCircleQuestion,
    title: "Waiting for a reply",
    tone: "bg-rr-missed-soft text-rr-missed-ink",
    usually: "Someone asks about aligners at 9 pm. By morning they have booked somewhere else.",
    instead: "They get a friendly answer straight away and appear on your list.",
  },
  {
    icon: PhoneCall,
    title: "Call back promised",
    tone: "bg-rr-risk-soft text-rr-risk-ink",
    usually: "“We'll call you about the quote.” A busy day later, nobody did.",
    instead: "The promise shows up on Today until someone calls.",
  },
  {
    icon: CalendarClock,
    title: "Hasn't confirmed",
    tone: "bg-rr-info-soft text-rr-info-ink",
    usually: "The chair sits empty because a patient forgot their appointment.",
    instead: "WhatsApp reminders two days and one day before, with a Confirm button.",
  },
  {
    icon: UserRoundSearch,
    title: "Due to come back",
    tone: "bg-rr-primary-soft text-rr-primary-strong",
    usually: "The root canal is done, the crown is never booked, and the patient drifts away.",
    instead: "A gentle reminder when the next step is due, and again a week later.",
  },
] as const;

const Leaks = () => (
  <section aria-labelledby="leaks" className="mx-auto max-w-6xl px-5 py-20">
    <h2 id="leaks" className="max-w-2xl text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
      Four ways bookings slip away every week.
    </h2>
    <p className="mt-4 max-w-xl text-lg text-rr-on-canvas-soft">None of them are anyone's fault. They are just easy to miss on a busy day.</p>
    <ul className="mt-12 grid gap-4 md:grid-cols-2">
      {LEAKS.map(({ icon: Icon, title, tone, usually, instead }) => (
        <li key={title} className="rounded-rr-card bg-rr-surface p-6 text-rr-ink sm:p-7">
          <span className={`grid size-12 place-items-center rounded-2xl ${tone}`} aria-hidden>
            <Icon size={22} />
          </span>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-rr-ink-soft">{usually}</p>
          <p className="mt-4 flex gap-2 border-t border-rr-line pt-4 font-medium">
            <Check size={18} className="mt-0.5 shrink-0 text-rr-recovered" aria-hidden />
            {instead}
          </p>
        </li>
      ))}
    </ul>
  </section>
);

const STEPS = [
  { title: "It notices", text: "Every few minutes it checks enquiries, appointments and planned treatment, and lists who needs you." },
  { title: "It reminds", text: "WhatsApp reminders go out at sensible times, never at night, and never more than three a week." },
  { title: "It listens", text: "A tap on Confirm confirms the appointment. Questions come to your inbox with a suggested reply." },
  { title: "It counts", text: "Every booking that came back after a reminder or call is added up, so you see what it is worth." },
] as const;

const HowItWorks = () => (
  <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20">
    <h2 id="how-title" className="text-4xl font-light tracking-tight sm:text-5xl">
      How it works
    </h2>
    <ol className="mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
      {STEPS.map((step, index) => (
        <li key={step.title} className="relative">
          <span className="grid size-12 place-items-center rounded-full border border-rr-canvas-line bg-white/5 text-lg font-light" aria-hidden>
            {index + 1}
          </span>
          {index < STEPS.length - 1 && (
            <span className="absolute top-6 left-16 hidden h-px w-[calc(100%-4.5rem)] bg-rr-canvas-line md:block" aria-hidden />
          )}
          <h3 className="mt-5 text-2xl font-semibold">{step.title}</h3>
          <p className="mt-2 text-rr-on-canvas-soft">{step.text}</p>
        </li>
      ))}
    </ol>
  </section>
);

const SmartSuggestions = () => (
  <section aria-labelledby="ai" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2">
    <div>
      <h2 id="ai" className="text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
        Reads every reply. Writes the answer. Waits for you.
      </h2>
      <p className="mt-5 max-w-lg text-lg text-rr-on-canvas-soft">
        When a patient writes back, the assistant works out what they want and drafts a short, polite reply. Your team
        reads it, changes anything they like, and presses Send. It never gives medical advice and never quotes prices on
        its own.
      </p>
    </div>
    <div className="rounded-rr-card bg-rr-surface p-6 text-rr-ink sm:p-7" aria-label="Example of a suggested reply">
      <p className="text-sm text-rr-ink-soft">Meera wrote</p>
      <p className="mt-1 rounded-2xl rounded-tl-md bg-white p-3.5 text-[15px] shadow-sm">
        Hi, how much do clear aligners cost? And do you offer EMI?
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-rr-info-soft px-3 py-1 text-sm font-semibold text-rr-info-ink">Question</span>
        <span className="text-sm text-rr-ink-soft">Asks about aligner price and EMI</span>
      </div>
      <div className="mt-4 rounded-2xl border border-rr-primary/30 bg-rr-primary-soft/60 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-rr-primary-strong">
          <Sparkles size={15} aria-hidden /> Suggested reply
        </p>
        <p className="mt-1.5 text-[15px]">
          Hi Meera, thanks for asking! Aligner cost depends on your teeth, so we start with a short consultation. We do
          offer EMI. Shall we book a time this week?
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <span className="rounded-full bg-rr-primary px-5 py-2 text-sm font-semibold text-white">Use this</span>
        <span className="rounded-full border border-rr-line-strong px-5 py-2 text-sm">Write my own</span>
      </div>
    </div>
  </section>
);

const ResultsBand = () => (
  <section aria-labelledby="results" className="mx-auto max-w-6xl px-5 py-20">
    <div className="grid items-center overflow-hidden rounded-rr-card border border-rr-canvas-line bg-white/5 lg:grid-cols-2">
      <div className="p-7 sm:p-10">
        <h2 id="results" className="text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
          See exactly what came back.
        </h2>
        <ul className="mt-6 flex flex-col gap-3 text-lg text-rr-on-canvas-soft">
          {[
            "Money and bookings won back this month",
            "Which kind of follow-up works best for your clinic",
            "A list of every patient who returned, ready for Excel",
            "Bookings that were later cancelled are taken off by themselves",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <Check size={20} className="mt-1 shrink-0 text-rr-recovered" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className="h-64 lg:h-96" aria-hidden>
        <Suspense fallback={null}>
          <RecoveryAnimation />
        </Suspense>
      </div>
    </div>
  </section>
);

const SAFETY: { icon: typeof BellOff; title: string; text: string }[] = [
  { icon: BellOff, title: "Never at night", text: "Messages wait until morning. You choose the hours." },
  { icon: Hand, title: "Never too often", text: "At most three automatic reminders a week per patient." },
  { icon: ShieldCheck, title: "You approve first", text: "Reminders can wait for one click from your team before they go." },
  { icon: Check, title: "STOP means stop", text: "Anyone who replies STOP is never messaged again." },
  { icon: LockKeyhole, title: "Private to your clinic", text: "Each clinic only ever sees its own patients and messages." },
  { icon: Trash2, title: "Deleted on request", text: "Erase a patient's messages in one step when they ask." },
];

const Safety = () => (
  <section id="safety" aria-labelledby="safety-title" className="mx-auto max-w-6xl scroll-mt-8 px-5 py-20">
    <h2 id="safety-title" className="max-w-2xl text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
      Kind to patients. Careful with their data.
    </h2>
    <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SAFETY.map(({ icon: Icon, title, text }) => (
        <li key={title} className="rounded-rr-card border border-rr-canvas-line bg-rr-canvas-raised/60 p-6">
          <Icon size={22} className="text-rr-recovered" aria-hidden />
          <h3 className="mt-4 text-xl font-semibold">{title}</h3>
          <p className="mt-1.5 text-rr-on-canvas-soft">{text}</p>
        </li>
      ))}
    </ul>
  </section>
);

const FAQS = [
  {
    q: "Do we need to change how our front desk works?",
    a: "No. Add a patient and their next appointment in a few seconds, the way you would in a diary. Revenue Recovery watches in the background and only asks for you when a patient needs a person.",
  },
  {
    q: "Which WhatsApp number do the messages come from?",
    a: "Your clinic's own WhatsApp Business number, connected through Meta's official WhatsApp Business Platform. Patients see your clinic name and can reply like any chat.",
  },
  {
    q: "Will patients get too many messages?",
    a: "No. Nothing is sent at night, each patient gets at most three automatic reminders a week, and anyone who replies STOP is never messaged again. You can also check every reminder before it goes.",
  },
  {
    q: "Does the AI talk to patients on its own?",
    a: "No. It reads replies and drafts an answer for your team. Simple taps like Confirm are handled automatically; anything else waits for a person. You can switch smart suggestions off.",
  },
  {
    q: "Can my whole team use it?",
    a: "Yes. The owner adds the front desk, dentists and managers. Everyone signs in with their own email, and each clinic only ever sees its own patients.",
  },
  {
    q: "How do we know it's working?",
    a: "Results shows every booking that came after a reminder or call, what it was worth, and which reminders work best for your clinic.",
  },
] as const;

const Faq = () => (
  <section id="faq" aria-labelledby="faq-title" className="mx-auto grid max-w-6xl scroll-mt-8 gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <div>
      <h2 id="faq-title" className="text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
        Questions clinics ask
      </h2>
      <p className="mt-4 text-lg text-rr-on-canvas-soft">Short answers, no jargon.</p>
    </div>
    <div className="flex flex-col gap-3">
      {FAQS.map(({ q, a }) => (
        <details key={q} className="group rounded-3xl border border-rr-canvas-line bg-white/[0.04] px-6 py-5 open:bg-white/[0.07]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
            {q}
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-rr-canvas-line text-xl font-light transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <p className="mt-3 text-rr-on-canvas-soft">{a}</p>
        </details>
      ))}
    </div>
  </section>
);

const FinalCall = () => (
  <section className="mx-auto max-w-6xl px-5 pt-10 pb-24">
    <div className="flex flex-col items-start gap-6 rounded-rr-card bg-rr-surface p-8 text-rr-ink sm:p-12 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-3xl font-light tracking-tight sm:text-4xl">Start with today's list.</h2>
        <p className="mt-2 max-w-lg text-lg text-rr-ink-soft">Set up your clinic in two minutes and see which patients need you right now.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/signup" className="inline-flex h-13 items-center gap-2 rounded-full bg-rr-primary px-7 text-lg font-semibold text-white transition-colors hover:bg-rr-primary-strong">
          Create your account <ArrowRight size={19} aria-hidden />
        </Link>
        <Link href="/login" className="inline-flex h-13 items-center rounded-full border border-rr-line-strong px-7 text-lg font-semibold transition-colors hover:bg-rr-bg">
          Sign in
        </Link>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-rr-canvas-line">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-rr-on-canvas-soft">
      <Logo />
      <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/privacy" className="hover:text-rr-on-canvas">Privacy</Link>
        <Link href="/terms" className="hover:text-rr-on-canvas">Terms</Link>
        <Link href="/login" className="hover:text-rr-on-canvas">Sign in</Link>
      </nav>
      <p>© {new Date().getFullYear()} Revenue Recovery. Made for dental clinics.</p>
    </div>
  </footer>
);

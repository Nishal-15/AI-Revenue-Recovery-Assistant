import type { ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import { Logo } from "./Logo";
import { Link } from "../lib/router";
import { connectionProblem, type ConnectionProblem } from "../lib/supabase";
import { BRAND } from "../lib/brand";
import { ThemeToggle } from "./ThemeToggle";

type AuthLayoutProps = { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode };

/** Two halves: a calm brand panel that shows what the product does, and the form. */
export const AuthLayout = ({ title, subtitle, children, footer }: AuthLayoutProps) => (
  <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
    <aside className="relative hidden overflow-hidden border-r border-rr-canvas-line bg-[radial-gradient(50rem_35rem_at_20%_0%,rgb(79_165_138/0.28),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,rgb(228_141_163/0.12),transparent_60%)] p-12 lg:flex lg:flex-col">
      <Link href="/" aria-label={`${BRAND} home`}>
        <Logo />
      </Link>
      <div className="my-auto max-w-md">
        <p className="text-4xl leading-tight font-light tracking-tight text-balance">
          Every patient who slipped away, found and gently brought back.
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <PreviewCard tone="bg-rr-risk" title="Ananya hasn't confirmed" detail="Implant consultation · Friday 10:30" badge="Reminder sent" />
          <PreviewCard tone="bg-rr-recovered" title="Rahul booked his crown" detail="Came back after a reminder" badge="Won back" />
          <PreviewCard tone="bg-rr-missed" title="Meera asked about aligners" detail="Reply suggested, waiting for you" badge="New" />
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-rr-on-canvas-soft">
        {["WhatsApp reminders", "No messages at night", "Patients can reply STOP"].map((line) => (
          <li key={line} className="flex items-center gap-1.5">
            <Check size={15} className="text-rr-recovered" aria-hidden /> {line}
          </li>
        ))}
      </ul>
    </aside>

    <main className="flex flex-col px-5 py-6 sm:px-10">
      <div className="lg:hidden">
        <Link href="/" aria-label={`${BRAND} home`}>
          <Logo />
        </Link>
      </div>
      <div className="mx-auto my-auto w-full max-w-md py-12">
        <h1 className="text-4xl font-light tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-lg text-rr-on-canvas-soft">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 text-center text-rr-on-canvas-soft">{footer}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-rr-on-canvas-soft">
        <ThemeToggle />
        <p>
        <Link href="/privacy" className="hover:text-rr-on-canvas">
          Privacy
        </Link>
        <span className="mx-2" aria-hidden>
          ·
        </span>
        <Link href="/terms" className="hover:text-rr-on-canvas">
          Terms
        </Link>
        </p>
      </div>
    </main>
  </div>
);

const PreviewCard = ({ tone, title, detail, badge }: { tone: string; title: string; detail: string; badge: string }) => (
  <div className="flex items-center gap-4 rounded-3xl border border-rr-canvas-line bg-rr-glass p-4 backdrop-blur-sm">
    <span className={`size-2.5 shrink-0 rounded-full ${tone}`} aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-rr-on-canvas-soft">{detail}</p>
    </div>
    <span className="flex items-center gap-1 rounded-full bg-rr-surface px-3 py-1 text-xs font-semibold text-rr-ink">
      {badge === "Won back" && <Sparkles size={12} aria-hidden />}
      {badge}
    </span>
  </div>
);

/** Shared field + button styles for the dark auth pages. */
export const AUTH_INPUT =
  "h-12 w-full rounded-2xl border border-rr-canvas-line bg-rr-glass px-4 text-rr-on-canvas outline-none transition-colors placeholder:text-rr-on-canvas-soft/70 focus:border-rr-recovered focus:bg-rr-glass-strong";

export const PRIMARY_BUTTON =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rr-cta font-semibold text-rr-on-cta transition-[background-color,transform] hover:bg-rr-cta-hover active:scale-[0.98] disabled:opacity-60";

export const SECONDARY_BUTTON =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-rr-canvas-line font-semibold transition-colors hover:bg-rr-glass-strong disabled:opacity-60";

export const AuthField = ({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) => (
  <label className="flex flex-col gap-1.5">
    <span className="flex items-center justify-between font-medium">
      {label}
      {aside}
    </span>
    {children}
  </label>
);

export const Notice = ({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) => (
  <p
    role={tone === "error" ? "alert" : "status"}
    className={
      tone === "error"
        ? "rounded-2xl bg-rr-missed-soft px-4 py-3 text-rr-missed-ink"
        : tone === "success"
          ? "rounded-2xl bg-rr-recovered-soft px-4 py-3 text-rr-recovered-ink"
          : "rounded-2xl bg-rr-risk-soft px-4 py-3 text-rr-risk-ink"
    }
  >
    {children}
  </p>
);

const SETUP_HELP: Record<Exclude<ConnectionProblem, null>, { title: string; steps: string[] }> = {
  "missing-url": {
    title: "The website doesn't know your Supabase project yet.",
    steps: [
      "Open supabase.com, then your project, then Project Settings -> API Keys (or the green Connect button).",
      "Copy the Project URL (https://....supabase.co).",
      "Paste it after VITE_SUPABASE_URL= in apps/web/.env and save.",
      "Stop the website (Ctrl+C in its terminal) and run npm run dev again.",
    ],
  },
  "bad-url": {
    title: "The project address in apps/web/.env doesn't look right.",
    steps: ["It should look like https://abcdefghijklmnopqrst.supabase.co with nothing after it.", "Fix it, save, then restart npm run dev."],
  },
  "missing-key": {
    title: "One step left: paste your publishable key.",
    steps: [
      "Open supabase.com, then your project, then Project Settings -> API Keys.",
      "Copy the Publishable key. It starts with sb_publishable_ (an older project may show it as the anon public key).",
      "Paste it after VITE_SUPABASE_ANON_KEY= in apps/web/.env and save.",
      "Stop the website (Ctrl+C in its terminal) and run npm run dev again.",
    ],
  },
  "secret-key": {
    title: "That's the secret key. Never put it in the website.",
    steps: [
      "The secret (service role) key skips every privacy rule, and anyone could read it from the website.",
      "Replace it in apps/web/.env with the Publishable key (sb_publishable_...) and restart npm run dev.",
      "If this file was ever shared or deployed, create a new secret key in Supabase so the old one stops working.",
    ],
  },
};

export const NotConfigured = () => {
  const help = SETUP_HELP[connectionProblem ?? "missing-key"];
  return (
    <div role="status" className="rounded-2xl bg-rr-risk-soft p-5 text-rr-risk-ink">
      <p className="font-semibold">{help.title}</p>
      <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5">
        {help.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
};

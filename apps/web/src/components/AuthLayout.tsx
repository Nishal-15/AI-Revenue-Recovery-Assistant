import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { Link } from "../lib/router";
import { connectionProblem, type ConnectionProblem } from "../lib/supabase";
import { BRAND } from "../lib/brand";
import { ThemeToggle } from "./ThemeToggle";
import { MessageCircleHeart, SearchCheck, TrendingUp } from "lucide-react";

export type AuthTab = "login" | "signup";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  /** Shows the Sign in / Create account switch at the top of the card. */
  tab?: AuthTab;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Words on the left (what the product does), one compact card on the right.
 * Sized to fit a laptop screen without scrolling; it only scrolls when the window is very short.
 */
export const AuthLayout = ({ title, subtitle, tab, children, footer }: AuthLayoutProps) => (
  <div className="relative min-h-screen">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(45rem_35rem_at_15%_20%,rgb(79_165_138/0.20),transparent_60%),radial-gradient(35rem_30rem_at_95%_95%,rgb(228_141_163/0.10),transparent_60%)]" />

    <div className="relative mx-auto grid min-h-screen max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_29rem] lg:gap-20 lg:px-12">
      <section className="relative hidden flex-col justify-center py-8 lg:flex">
        <Link href="/" aria-label={`${BRAND} home`} className="absolute top-8 left-0">
          <Logo />
        </Link>
        <BrandStory />
      </section>

      <main className="flex flex-col justify-center py-4">
        <div className="mb-6 lg:hidden">
          <Link href="/" aria-label={`${BRAND} home`}>
            <Logo />
          </Link>
        </div>

        <div className="rounded-[1.75rem] border border-rr-canvas-line bg-rr-canvas-raised/70 p-6 shadow-rr-lift backdrop-blur-xl sm:p-7">
          {tab && <AuthTabs active={tab} />}
          <h1 className={`${tab ? "mt-6" : ""} text-3xl leading-tight font-light tracking-tight`}>{title}</h1>
          {subtitle && <p className="mt-1 text-rr-on-canvas-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-rr-on-canvas-soft">{footer}</div>}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm text-rr-on-canvas-soft">
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
  </div>
);

const POINTS = [
  { icon: SearchCheck, title: "Finds who is slipping away", text: "Unanswered enquiries, unconfirmed appointments and treatment nobody booked." },
  { icon: MessageCircleHeart, title: "Reminds them kindly on WhatsApp", text: "At sensible hours, never too often, and only to patients who agreed." },
  { icon: TrendingUp, title: "Shows what came back", text: "Every returning booking and what it was worth, month by month." },
] as const;

/** The left side: what the product does, in plain words. */
const BrandStory = () => (
  <div className="max-w-lg">
    <p className="text-sm font-semibold tracking-[0.2em] text-rr-recovered uppercase">For dental clinics</p>
    <h2 className="mt-4 text-5xl leading-[1.08] font-light tracking-tight text-balance">
      Every missed booking, gently brought back.
    </h2>
    <p className="mt-5 text-lg text-pretty text-rr-on-canvas-soft">
      {BRAND} keeps an eye on your enquiries, appointments and treatment plans, and reminds patients before they
      quietly drift away.
    </p>
    <ul className="mt-9 flex flex-col gap-5">
      {POINTS.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-rr-canvas-line bg-rr-glass text-rr-recovered">
            <Icon size={20} aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">{title}</span>
            <span className="block text-rr-on-canvas-soft">{text}</span>
          </span>
        </li>
      ))}
    </ul>
    <p className="mt-10 flex flex-wrap gap-x-5 gap-y-1 text-sm text-rr-on-canvas-soft">
      <span>Private to your clinic</span>
      <span aria-hidden>·</span>
      <span>No messages at night</span>
      <span aria-hidden>·</span>
      <span>Patients can reply STOP</span>
    </p>
  </div>
);

/** Two pages, one switch: a pill slides between Sign in and Create account. */
const AuthTabs = ({ active }: { active: AuthTab }) => (
  <nav aria-label="Sign in or create an account" className="relative grid grid-cols-2 rounded-full border border-rr-canvas-line bg-rr-glass p-1">
    <span
      aria-hidden
      className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-rr-cta shadow-rr-card transition-transform duration-300 ease-out ${
        active === "signup" ? "translate-x-full" : "translate-x-0"
      }`}
    />
    {(
      [
        ["login", "/login", "Sign in"],
        ["signup", "/signup", "Create account"],
      ] as const
    ).map(([id, href, label]) => (
      <Link
        key={id}
        href={href}
        aria-current={active === id ? "page" : undefined}
        className={`relative z-10 grid h-10 place-items-center rounded-full text-sm font-semibold transition-colors duration-300 ${
          active === id ? "text-rr-on-cta" : "text-rr-on-canvas-soft hover:text-rr-on-canvas"
        }`}
      >
        {label}
      </Link>
    ))}
  </nav>
);

/** "or continue with email" between the social buttons and the form. */
export const OrDivider = ({ children = "or with email" }: { children?: ReactNode }) => (
  <div className="my-5 flex items-center gap-3 text-xs tracking-wide text-rr-on-canvas-soft uppercase" aria-hidden>
    <span className="h-px flex-1 bg-rr-canvas-line" /> {children} <span className="h-px flex-1 bg-rr-canvas-line" />
  </div>
);

/** Shared field + button styles for the dark auth pages. */
export const AUTH_INPUT =
  "h-11 w-full rounded-2xl border border-rr-canvas-line bg-rr-glass px-4 text-rr-on-canvas outline-none transition-colors placeholder:text-rr-on-canvas-soft/70 focus:border-rr-recovered focus:bg-rr-glass-strong";

export const PRIMARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-rr-cta font-semibold text-rr-on-cta transition-[background-color,transform] hover:bg-rr-cta-hover active:scale-[0.98] disabled:opacity-60";

export const SECONDARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-rr-canvas-line font-semibold transition-colors hover:bg-rr-glass-strong disabled:opacity-60";

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

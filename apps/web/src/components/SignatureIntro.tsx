import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import { BRAND, LOGO_URL } from "../lib/brand";

const TOTAL_MS = 3000;
const FADE_MS = 450;

const greeting = (): string => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

/** "Dr Anjali Rao" -> "Dr Anjali", "Sachin Kumar" -> "Sachin". */
const shortName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  return /^dr\.?$/i.test(parts[0] ?? "") ? parts.slice(0, 2).join(" ") : parts[0] ?? "";
};

const storageKey = (clinicId: string) => `rr-intro-${clinicId}`;

/** Show once per sign-in session, and never to people who asked their device for less motion. */
export const shouldShowIntro = (clinicId: string): boolean => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return sessionStorage.getItem(storageKey(clinicId)) !== "seen";
  } catch {
    return false;
  }
};

type SignatureIntroProps = { clinicId: string; clinicName: string; staffName: string; onDone: () => void };

/**
 * The clinic's name, written out like a signature: the ink appears left to right, a flourish underlines it,
 * then a greeting. About three seconds; any click or key skips it.
 */
export const SignatureIntro = ({ clinicId, clinicName, staffName, onDone }: SignatureIntroProps) => {
  const [phase, setPhase] = useState<"waiting" | "writing" | "leaving">("waiting");
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setPhase("leaving");
    window.setTimeout(onDone, FADE_MS);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(clinicId), "seen");
    } catch {
      // Storage blocked: it simply shows again next time.
    }
    // Start writing once the script font is ready (or after a short wait), so the name never jumps.
    let cancelled = false;
    const start = () => !cancelled && setPhase((current) => (current === "waiting" ? "writing" : current));
    Promise.race([document.fonts?.load("64px Allura") ?? Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 600))]).then(start, start);
    const timer = window.setTimeout(finish, TOTAL_MS);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const name = shortName(staffName);

  return (
    <div
      role="dialog"
      aria-label={`Welcome to ${clinicName}`}
      onClick={finish}
      className={`rr-intro fixed inset-0 z-50 grid cursor-pointer place-items-center bg-rr-canvas px-6 transition-opacity ease-out ${
        phase === "leaving" ? "opacity-0" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_50%_40%,rgb(79_165_138/0.22),transparent_65%)]" />
      {phase !== "waiting" && (
        <div className="relative flex flex-col items-center text-center">
          <span className="rr-intro-fade" style={{ animationDelay: "0ms" }}>
            {LOGO_URL ? <img src={LOGO_URL} alt="" className="h-12 w-auto" /> : <LogoMark className="size-12" />}
          </span>
          <p className="rr-intro-fade mt-6 text-sm tracking-[0.3em] text-rr-on-canvas-soft uppercase" style={{ animationDelay: "150ms" }}>
            Welcome to
          </p>
          <h1 className="rr-sign mt-2 px-4 pb-2 font-[Allura] text-6xl leading-tight text-rr-on-canvas sm:text-8xl">{clinicName}</h1>
          <svg viewBox="0 0 320 24" className="-mt-2 h-6 w-64 text-rr-recovered sm:w-80" aria-hidden>
            <path
              className="rr-flourish"
              d="M4 16 C 60 4, 120 22, 180 12 S 280 6, 316 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          {name && (
            <p className="rr-intro-fade mt-6 text-xl font-light text-rr-on-canvas-soft" style={{ animationDelay: "1700ms" }}>
              {greeting()}, {name}.
            </p>
          )}
          <p className="rr-intro-fade mt-10 text-xs text-rr-on-canvas-soft/70" style={{ animationDelay: "2000ms" }}>
            {BRAND} · tap or click to skip
          </p>
        </div>
      )}
    </div>
  );
};

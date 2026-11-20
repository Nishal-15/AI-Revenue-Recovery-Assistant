import { useEffect, useState, type CSSProperties } from "react";
import { LogoMark } from "./Logo";
import { LOGO_URL } from "../lib/brand";

const LINES = ["Missed enquiries, found.", "Reminders sent at the right moment.", "Patients back in the chair."] as const;

// Patients circling the clinic: ring (as % of the square), starting angle, seconds per turn, colour.
const ORBITERS = [
  { ring: 22, angle: 20, speed: 38, tone: "bg-rr-risk" },
  { ring: 22, angle: 200, speed: 38, tone: "bg-rr-info" },
  { ring: 34, angle: 110, speed: 52, tone: "bg-rr-missed" },
  { ring: 34, angle: 290, speed: 52, tone: "bg-rr-recovered" },
  { ring: 46, angle: 60, speed: 70, tone: "bg-rr-info" },
  { ring: 46, angle: 170, speed: 70, tone: "bg-rr-risk" },
  { ring: 46, angle: 320, speed: 70, tone: "bg-rr-missed" },
] as const;

// Every few seconds one patient drifts back into the centre.
const RETURNS = [
  { angle: 35, delay: 0 },
  { angle: 155, delay: 2.4 },
  { angle: 265, delay: 4.8 },
] as const;

/**
 * The idea of the product without words: your clinic in the middle, patients drifting away on their orbits,
 * and one after another finding their way back. Pure CSS motion; still for people who ask for less motion.
 */
export const ReturnOrbit = () => {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLine((current) => (current + 1) % LINES.length), 2400);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="rr-orbit-stage relative aspect-square w-full max-w-[26rem]" aria-hidden>
        {[22, 34, 46].map((ring) => (
          <span
            key={ring}
            className="absolute rounded-full border border-dashed border-rr-canvas-line"
            style={{ inset: `${50 - ring}%` }}
          />
        ))}

        {ORBITERS.map(({ ring, angle, speed, tone }, index) => (
          <span
            key={index}
            className="rr-spin absolute inset-0"
            style={{ "--start": `${angle}deg`, animationDuration: `${speed}s` } as CSSProperties}
          >
            <span
              className={`absolute left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-rr-canvas ${tone}`}
              style={{ top: `${50 - ring}%` }}
            />
          </span>
        ))}

        {RETURNS.map(({ angle, delay }) => (
          <span key={angle} className="absolute inset-0" style={{ transform: `rotate(${angle}deg)` }}>
            <span
              className="rr-return absolute top-1/2 left-1/2 size-4 rounded-full bg-rr-recovered shadow-[0_0_0_5px_rgb(79_165_138/0.18),0_0_26px_rgb(79_165_138/0.95)]"
              style={{ animationDelay: `${delay}s` }}
            />
          </span>
        ))}

        <span className="absolute inset-[38%] grid place-items-center">
          <span className="rr-glow absolute inset-0 rounded-full bg-rr-recovered/25" />
          <span className="relative grid size-full place-items-center rounded-full bg-rr-surface shadow-rr-lift">
            {LOGO_URL ? <img src={LOGO_URL} alt="" className="size-3/5 object-contain" /> : <LogoMark className="size-3/5" />}
          </span>
        </span>
      </div>

      <p className="relative mt-8 h-10 w-full text-center text-3xl font-light tracking-tight" aria-live="polite">
        {LINES.map((text, index) => (
          <span
            key={text}
            className={`absolute inset-x-0 transition-[opacity,transform] duration-700 ${
              index === line ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
            aria-hidden={index !== line}
          >
            {text}
          </span>
        ))}
      </p>
      <div className="mt-5 flex gap-2" aria-hidden>
        {LINES.map((text, index) => (
          <span key={text} className={`h-1.5 rounded-full transition-all duration-500 ${index === line ? "w-6 bg-rr-recovered" : "w-1.5 bg-rr-canvas-line"}`} />
        ))}
      </div>
    </div>
  );
};

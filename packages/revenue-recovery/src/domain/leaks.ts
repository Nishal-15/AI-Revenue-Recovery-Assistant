import { CalendarClock, MessageCircleQuestion, PhoneCall, UserRoundSearch, type LucideIcon } from "lucide-react";
import type { LeakType, RecoveryItemStatus } from "./types";

export type Tone = "missed" | "risk" | "info" | "primary" | "recovered" | "neutral";

type LeakMeta = {
  /** Plain label a receptionist would use. */
  label: string;
  /** What to do about it, in one short line. */
  description: string;
  icon: LucideIcon;
  tone: Tone;
};

export const LEAK_META = {
  missed_enquiry: {
    label: "Waiting for a reply",
    description: "Asked about treatment, nobody answered yet",
    icon: MessageCircleQuestion,
    tone: "missed",
  },
  overdue_followup: {
    label: "Call back promised",
    description: "We said we would call, and haven't yet",
    icon: PhoneCall,
    tone: "risk",
  },
  unconfirmed_appointment: {
    label: "Hasn't confirmed",
    description: "Coming in the next 3 days, not confirmed",
    icon: CalendarClock,
    tone: "info",
  },
  lapsed_patient: {
    label: "Due to come back",
    description: "Next treatment or check-up not booked",
    icon: UserRoundSearch,
    tone: "primary",
  },
} as const satisfies Record<LeakType, LeakMeta>;

/** The same words wherever a patient's status appears. */
export const STATUS_WORDS = {
  open: { label: "To do", tone: "neutral" },
  in_progress: { label: "Working on it", tone: "info" },
  recovered: { label: "Booked", tone: "recovered" },
  lost: { label: "Not coming", tone: "missed" },
  dismissed: { label: "Not needed", tone: "neutral" },
} as const satisfies Record<RecoveryItemStatus, { label: string; tone: Tone }>;

export const TONE_CLASSES = {
  missed: { text: "text-rr-missed", ink: "text-rr-missed-ink", soft: "bg-rr-missed-soft", bar: "bg-rr-missed" },
  risk: { text: "text-rr-risk", ink: "text-rr-risk-ink", soft: "bg-rr-risk-soft", bar: "bg-rr-risk" },
  info: { text: "text-rr-info", ink: "text-rr-info-ink", soft: "bg-rr-info-soft", bar: "bg-rr-info" },
  primary: { text: "text-rr-primary", ink: "text-rr-primary-strong", soft: "bg-rr-primary-soft", bar: "bg-rr-primary" },
  recovered: {
    text: "text-rr-recovered",
    ink: "text-rr-recovered-ink",
    soft: "bg-rr-recovered-soft",
    bar: "bg-rr-recovered",
  },
  neutral: { text: "text-rr-ink-soft", ink: "text-rr-ink-soft", soft: "bg-rr-bg", bar: "bg-rr-ink-faint" },
} as const satisfies Record<Tone, { text: string; ink: string; soft: string; bar: string }>;

import { CalendarClock, CalendarX2, MessageCircleQuestion, UserRoundSearch, type LucideIcon } from "lucide-react";
import type { LeakType } from "./types";

type Tone = "missed" | "risk" | "info" | "primary";

type LeakMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
};

export const LEAK_META = {
  missed_enquiry: {
    label: "Missed enquiries",
    description: "No reply or no booking yet",
    icon: MessageCircleQuestion,
    tone: "missed",
  },
  overdue_followup: {
    label: "Overdue follow-ups",
    description: "Callbacks past their due time",
    icon: CalendarClock,
    tone: "risk",
  },
  unconfirmed_appointment: {
    label: "Unconfirmed appointments",
    description: "Next 72 hours, not confirmed",
    icon: CalendarX2,
    tone: "info",
  },
  lapsed_patient: {
    label: "Not returned",
    description: "Planned follow-up never booked",
    icon: UserRoundSearch,
    tone: "primary",
  },
} as const satisfies Record<LeakType, LeakMeta>;

export const TONE_CLASSES = {
  missed: { text: "text-rr-missed", soft: "bg-rr-missed-soft", bar: "bg-rr-missed" },
  risk: { text: "text-rr-risk", soft: "bg-rr-risk-soft", bar: "bg-rr-risk" },
  info: { text: "text-rr-info", soft: "bg-rr-info-soft", bar: "bg-rr-info" },
  primary: { text: "text-rr-primary", soft: "bg-rr-primary-soft", bar: "bg-rr-primary" },
} as const satisfies Record<Tone, { text: string; soft: string; bar: string }>;

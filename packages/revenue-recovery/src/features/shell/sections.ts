import { CalendarCheck2, MessagesSquare, Settings2, Sun, TrendingUp, type LucideIcon } from "lucide-react";

export const SECTION_IDS = ["today", "appointments", "messages", "results", "settings"] as const;

export type SectionId = (typeof SECTION_IDS)[number];

type Section = { label: string; icon: LucideIcon };

export const SECTIONS = {
  today: { label: "Today", icon: Sun },
  appointments: { label: "Appointments", icon: CalendarCheck2 },
  messages: { label: "Messages", icon: MessagesSquare },
  results: { label: "Results", icon: TrendingUp },
  settings: { label: "Settings", icon: Settings2 },
} as const satisfies Record<SectionId, Section>;

export const isSectionId = (value: string): value is SectionId =>
  (SECTION_IDS as readonly string[]).includes(value);

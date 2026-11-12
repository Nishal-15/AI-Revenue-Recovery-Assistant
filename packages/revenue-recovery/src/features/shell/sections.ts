import {
  BarChart3,
  CalendarCheck2,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Settings2,
  UserRoundSearch,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export const SECTION_IDS = [
  "dashboard",
  "worklist",
  "confirmations",
  "recalls",
  "inbox",
  "automations",
  "reports",
  "settings",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

type Section = { label: string; icon: LucideIcon; plannedPhase: number | null };

export const SECTIONS = {
  dashboard: { label: "Dashboard", icon: LayoutDashboard, plannedPhase: null },
  worklist: { label: "Worklist", icon: ListTodo, plannedPhase: null },
  confirmations: { label: "Confirmations", icon: CalendarCheck2, plannedPhase: null },
  recalls: { label: "Recalls", icon: UserRoundSearch, plannedPhase: null },
  inbox: { label: "WhatsApp inbox", icon: MessagesSquare, plannedPhase: 2 },
  automations: { label: "Automations", icon: Workflow, plannedPhase: 2 },
  reports: { label: "Reports", icon: BarChart3, plannedPhase: 4 },
  settings: { label: "Settings", icon: Settings2, plannedPhase: 2 },
} as const satisfies Record<SectionId, Section>;

export const isSectionId = (value: string): value is SectionId =>
  (SECTION_IDS as readonly string[]).includes(value);

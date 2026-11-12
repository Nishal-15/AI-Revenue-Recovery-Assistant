import type { LeakType } from "./types";

// Mirrors recovery.message_status / message_direction in the migrations.
export type MessageStatus =
  | "queued"
  | "awaiting_approval"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "cancelled";

export type MessageDirection = "outbound" | "inbound";

export type OutreachMessage = {
  id: string;
  direction: MessageDirection;
  contactPhone: string;
  body: string | null;
  status: MessageStatus;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  handledAt: string | null;
  templateId: string | null;
  recoveryItemId: string | null;
  /** True when an automation sequence produced it rather than a person. */
  automated: boolean;
};

export type ApprovalItem = OutreachMessage & { contactName: string };

export type Conversation = {
  contactPhone: string;
  contactName: string;
  lastBody: string | null;
  lastDirection: MessageDirection;
  lastStatus: MessageStatus;
  lastAt: string;
  lastInboundAt: string | null;
  unhandledCount: number;
};

export type MessageTemplate = {
  id: string;
  leakType: LeakType | null;
  name: string;
  whatsappTemplateName: string | null;
  body: string;
  variables: string[];
  buttons: string[];
  isActive: boolean;
};

export type AutomationStep = {
  anchor: "due" | "detected";
  offsetMinutes: number;
  templateId: string;
};

export type AutomationRule = {
  id: string;
  leakType: LeakType;
  name: string;
  isActive: boolean;
  steps: AutomationStep[];
};

export type ClinicSettings = {
  /** "HH:MM", clinic local time. */
  quietHoursStart: string;
  quietHoursEnd: string;
  maxMessagesPerWeek: number;
  attributionWindowDays: number;
  enquiryResponseSlaMinutes: number;
  unconfirmedLookaheadHours: number;
  lapsedGraceDays: number;
  requireStaffApproval: boolean;
  whatsappPhoneNumberId: string | null;
};

/** Column defaults from recovery.clinic_settings, used before a clinic saves its own. */
export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  quietHoursStart: "21:00",
  quietHoursEnd: "09:00",
  maxMessagesPerWeek: 3,
  attributionWindowDays: 14,
  enquiryResponseSlaMinutes: 60,
  unconfirmedLookaheadHours: 72,
  lapsedGraceDays: 7,
  requireStaffApproval: true,
  whatsappPhoneNumberId: null,
};

export type NewOutboundMessage =
  | { kind: "text"; contactPhone: string; text: string }
  | { kind: "template"; contactPhone: string; templateId: string; recoveryItemId: string | null };

/** WhatsApp only allows free-text replies within 24 hours of the patient's last message. */
export const REPLY_WINDOW_MS = 24 * 3_600_000;

export const isReplyWindowOpen = (lastInboundAt: string | null, now: number = Date.now()): boolean =>
  lastInboundAt !== null && now - new Date(lastInboundAt).getTime() < REPLY_WINDOW_MS;

export const phoneDigits = (phone: string): string => phone.replace(/\D/g, "");

const VARIABLE_LABELS: Record<string, string> = {
  patient_first_name: "first name",
  patient_name: "patient name",
  clinic_name: "clinic name",
  treatment: "treatment",
  appointment_time: "appointment time",
  procedure: "procedure",
};

/** Variables the engine can fill from a phone number alone, without a worklist item. */
const CONTACT_VARIABLES = new Set(["patient_first_name", "patient_name", "clinic_name"]);

/** True when the template needs nothing beyond who the patient is (safe to send from the inbox). */
export const isContactOnlyTemplate = (template: MessageTemplate): boolean =>
  template.variables.every((variable) => CONTACT_VARIABLES.has(variable));

/** Fills {{1}}, {{2}} with known values, or a readable [placeholder] the engine fills at send time. */
export const previewTemplate = (template: MessageTemplate, values: Record<string, string> = {}): string =>
  template.body.replace(/\{\{(\d+)\}\}/g, (match, position: string) => {
    const variable = template.variables[Number(position) - 1];
    if (variable === undefined) return match;
    return values[variable] ?? `[${VARIABLE_LABELS[variable] ?? variable.replace(/_/g, " ")}]`;
  });

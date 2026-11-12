import type {
  AiReading,
  ApprovalItem,
  AutomationRule,
  ClinicSettings,
  Conversation,
  MessageTemplate,
  NewOutboundMessage,
  OutreachMessage,
} from "../domain/outreach";
import { DEFAULT_CLINIC_SETTINGS, isReplyWindowOpen, phoneDigits, previewTemplate } from "../domain/outreach";

// In-memory stand-in for WhatsApp outreach in demo mode. Sending applies the same 24-hour rule
// as the engine, so the demo behaves like the real thing. Resets on page reload.

type DemoMessage = OutreachMessage & { contactName: string };

const MINUTE_MS = 60_000;

const TEMPLATES: MessageTemplate[] = [
  {
    id: "demo-tpl-confirm",
    leakType: "unconfirmed_appointment",
    name: "Appointment confirmation",
    whatsappTemplateName: "appointment_confirmation",
    body: "Hi {{1}}, this is {{2}}. Your {{3}} is booked for {{4}}. Please tap Confirm, or Reschedule if the time no longer works for you.",
    variables: ["patient_first_name", "clinic_name", "treatment", "appointment_time"],
    buttons: ["Confirm", "Reschedule"],
    isActive: true,
  },
  {
    id: "demo-tpl-final",
    leakType: "unconfirmed_appointment",
    name: "Appointment final reminder",
    whatsappTemplateName: "appointment_final_reminder",
    body: "Hi {{1}}, a quick reminder of your {{2}} at {{3}}. Tap Confirm so we can keep your slot ready.",
    variables: ["patient_first_name", "treatment", "appointment_time"],
    buttons: ["Confirm", "Reschedule"],
    isActive: true,
  },
  {
    id: "demo-tpl-enquiry",
    leakType: "missed_enquiry",
    name: "Enquiry follow-up",
    whatsappTemplateName: "enquiry_followup",
    body: "Hi {{1}}, thank you for contacting {{2}}. We would be glad to help. Would you like us to book a consultation for you?",
    variables: ["patient_first_name", "clinic_name"],
    buttons: ["Book", "Call me"],
    isActive: true,
  },
  {
    id: "demo-tpl-followup",
    leakType: "lapsed_patient",
    name: "Follow-up due",
    whatsappTemplateName: "followup_due",
    body: "Hi {{1}}, our records show your {{2}} is now due at {{3}}. Shall we find a time that suits you?",
    variables: ["patient_first_name", "procedure", "clinic_name"],
    buttons: ["Book", "Call me"],
    isActive: true,
  },
];

const RULES: AutomationRule[] = [
  {
    id: "demo-rule-unconfirmed",
    leakType: "unconfirmed_appointment",
    name: "Confirm upcoming appointments",
    isActive: true,
    steps: [
      { anchor: "due", offsetMinutes: -2880, templateId: "demo-tpl-confirm" },
      { anchor: "due", offsetMinutes: -1440, templateId: "demo-tpl-final" },
    ],
  },
  {
    id: "demo-rule-enquiry",
    leakType: "missed_enquiry",
    name: "Follow up unanswered enquiries",
    isActive: true,
    steps: [
      { anchor: "detected", offsetMinutes: 0, templateId: "demo-tpl-enquiry" },
      { anchor: "detected", offsetMinutes: 2880, templateId: "demo-tpl-enquiry" },
    ],
  },
  {
    id: "demo-rule-lapsed",
    leakType: "lapsed_patient",
    name: "Bring patients back for planned care",
    isActive: true,
    steps: [
      { anchor: "detected", offsetMinutes: 0, templateId: "demo-tpl-followup" },
      { anchor: "detected", offsetMinutes: 10080, templateId: "demo-tpl-followup" },
    ],
  },
];

const fill = (templateId: string, values: Record<string, string>): string => {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId);
  return template ? previewTemplate(template, values) : "";
};

type Seed = Omit<DemoMessage, "id" | "createdAt" | "sentAt" | "handledAt" | "error" | "recoveryItemId" | "ai"> & {
  minutesAgo: number;
  handled?: boolean;
  ai?: AiReading;
};

const seeds = (): Seed[] => [
  {
    contactName: "Ananya Rao", contactPhone: "+91 98450 12345", direction: "outbound", status: "read",
    templateId: "demo-tpl-confirm", automated: true, minutesAgo: 20 * 60,
    body: fill("demo-tpl-confirm", { patient_first_name: "Ananya", clinic_name: "Smile Studio Dental", treatment: "Implant consultation", appointment_time: "tomorrow, 10:30 am" }),
  },
  {
    contactName: "Ananya Rao", contactPhone: "+919845012345", direction: "inbound", status: "delivered",
    templateId: null, automated: false, minutesAgo: 35, body: "Hi, can I come at 11:30 instead of 10:30?",
    ai: {
      intent: "reschedule", confidence: 0.93, summary: "Wants to move the appointment (11:30 instead of 10:30)",
      suggestedReply: "Hi Ananya, let me check the 11:30 slot for tomorrow and confirm in a few minutes. 🙂 – Smile Studio Dental",
    },
  },
  {
    contactName: "Meera Iyer", contactPhone: "+919900023456", direction: "inbound", status: "delivered",
    templateId: null, automated: false, minutesAgo: 3 * 60, body: "Hi, how much do clear aligners cost? And do you offer EMI?",
    ai: {
      intent: "question", confidence: 0.96, summary: "Asks aligner price and EMI options",
      suggestedReply: "Hi Meera, thanks for asking! Aligner cost depends on your teeth, so we start with a short consultation. We do offer EMI. Shall we book a consultation this week? – Smile Studio Dental",
    },
  },
  {
    contactName: "Vikram Shah", contactPhone: "+91 98201 44556", direction: "outbound", status: "delivered",
    templateId: "demo-tpl-followup", automated: true, minutesAgo: 2 * 24 * 60,
    body: fill("demo-tpl-followup", { patient_first_name: "Vikram", procedure: "Crown after root canal", clinic_name: "Smile Studio Dental" }),
  },
  {
    contactName: "Kavya Menon", contactPhone: "+91 98720 90876", direction: "outbound", status: "replied",
    templateId: "demo-tpl-confirm", automated: true, minutesAgo: 26 * 60,
    body: fill("demo-tpl-confirm", { patient_first_name: "Kavya", clinic_name: "Smile Studio Dental", treatment: "Braces adjustment", appointment_time: "today, 2:00 pm" }),
  },
  {
    contactName: "Kavya Menon", contactPhone: "+919872090876", direction: "inbound", status: "delivered",
    templateId: null, automated: false, minutesAgo: 25 * 60, body: "Confirm", handled: true,
  },
  {
    contactName: "Suresh", contactPhone: "+919000011122", direction: "inbound", status: "delivered",
    templateId: null, automated: false, minutesAgo: 10, body: "Hello, are you open on Sundays? I have a broken tooth.",
    ai: {
      intent: "question", confidence: 0.9, summary: "Broken tooth, asks about Sunday opening",
      suggestedReply: "Hi Suresh, sorry to hear about your tooth. Our team will call you shortly to find the earliest slot. If you have severe pain or swelling, please visit emergency care. – Smile Studio Dental",
    },
  },
  {
    contactName: "Rohan Gupta", contactPhone: "+91 98100 65432", direction: "outbound", status: "awaiting_approval",
    templateId: "demo-tpl-final", automated: true, minutesAgo: 5,
    body: fill("demo-tpl-final", { patient_first_name: "Rohan", treatment: "Root canal, sitting 2", appointment_time: "tomorrow, 4:00 pm" }),
  },
  {
    contactName: "Fatima Khan", contactPhone: "+91 99870 34512", direction: "outbound", status: "awaiting_approval",
    templateId: "demo-tpl-followup", automated: true, minutesAgo: 12,
    body: fill("demo-tpl-followup", { patient_first_name: "Fatima", procedure: "6-month hygiene recall", clinic_name: "Smile Studio Dental" }),
  },
  {
    contactName: "Arjun Nair", contactPhone: "+91 98111 20304", direction: "outbound", status: "awaiting_approval",
    templateId: "demo-tpl-enquiry", automated: true, minutesAgo: 18,
    body: fill("demo-tpl-enquiry", { patient_first_name: "Arjun", clinic_name: "Smile Studio Dental" }),
  },
];

type DemoOutreachState = {
  messages: DemoMessage[];
  rules: AutomationRule[];
  settings: ClinicSettings;
};

let state: DemoOutreachState | null = null;
let nextId = 1;

const getState = (): DemoOutreachState => {
  if (!state) {
    const now = Date.now();
    state = {
      messages: seeds().map(({ minutesAgo, handled, ai, ...seed }) => {
        const createdAt = new Date(now - minutesAgo * MINUTE_MS).toISOString();
        const isSent = seed.direction === "outbound" && seed.status !== "awaiting_approval";
        return {
          ...seed,
          id: `demo-msg-${nextId++}`,
          createdAt,
          sentAt: isSent ? createdAt : null,
          handledAt: handled ? createdAt : null,
          error: null,
          recoveryItemId: null,
          ai: ai ?? null,
        };
      }),
      rules: RULES.map((rule) => ({ ...rule, steps: [...rule.steps] })),
      settings: { ...DEFAULT_CLINIC_SETTINGS, whatsappPhoneNumberId: null },
    };
  }
  return state;
};

const LATENCY_MS = 200;
const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

const samePhone = (a: string, b: string): boolean => phoneDigits(a) === phoneDigits(b);

const conversationsFrom = (messages: DemoMessage[]): Conversation[] => {
  const byPhone = new Map<string, DemoMessage[]>();
  for (const message of messages) {
    if (message.status === "cancelled" || message.status === "awaiting_approval") continue;
    const key = phoneDigits(message.contactPhone);
    byPhone.set(key, [...(byPhone.get(key) ?? []), message]);
  }
  return [...byPhone.values()]
    .map((thread) => {
      const sorted = [...thread].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = sorted[sorted.length - 1];
      if (!last) throw new Error("empty conversation");
      const inbound = sorted.filter((message) => message.direction === "inbound");
      return {
        contactPhone: last.contactPhone,
        contactName: last.contactName,
        lastBody: last.body,
        lastDirection: last.direction,
        lastStatus: last.status,
        lastAt: last.createdAt,
        lastInboundAt: inbound[inbound.length - 1]?.createdAt ?? null,
        unhandledCount: inbound.filter((message) => message.handledAt === null).length,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
};

const strip = ({ contactName: _name, ...message }: DemoMessage): OutreachMessage => message;

export const demoOutreach = {
  listConversations: async (): Promise<Conversation[]> => {
    await pause();
    return conversationsFrom(getState().messages);
  },

  listThread: async (phone: string): Promise<OutreachMessage[]> => {
    await pause();
    return getState()
      .messages.filter((message) => samePhone(message.contactPhone, phone) && message.status !== "awaiting_approval")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(strip);
  },

  listApprovals: async (): Promise<ApprovalItem[]> => {
    await pause();
    return getState()
      .messages.filter((message) => message.status === "awaiting_approval")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((message) => ({ ...strip(message), contactName: message.contactName }));
  },

  /** In demo mode approved messages "send" straight away; the engine does this within a minute. */
  approve: async (ids: string[]): Promise<void> => {
    await pause();
    const now = new Date().toISOString();
    const current = getState();
    current.messages = current.messages.map((message) =>
      ids.includes(message.id) ? { ...message, status: "sent", sentAt: now, createdAt: now } : message,
    );
  },

  cancel: async (id: string): Promise<void> => {
    await pause();
    const current = getState();
    current.messages = current.messages.map((message) =>
      message.id === id ? { ...message, status: "cancelled", error: "Cancelled by staff" } : message,
    );
  },

  send: async (draft: NewOutboundMessage): Promise<void> => {
    await pause();
    const current = getState();
    const thread = current.messages.filter((message) => samePhone(message.contactPhone, draft.contactPhone));
    const lastInbound = thread.filter((message) => message.direction === "inbound").at(-1)?.createdAt ?? null;
    const contactName = thread.at(-1)?.contactName ?? draft.contactPhone;
    const now = new Date().toISOString();
    const windowOpen = isReplyWindowOpen(lastInbound);

    const body =
      draft.kind === "text"
        ? draft.text
        : fill(draft.templateId, {
            patient_first_name: contactName.split(" ")[0] ?? "there",
            clinic_name: "Smile Studio Dental",
            // The engine reads these from the linked appointment or follow-up; the demo uses stand-ins.
            treatment: "appointment",
            appointment_time: "tomorrow, 10:30 am",
            procedure: "planned treatment",
          });
    const blocked = draft.kind === "text" && !windowOpen;

    current.messages = [
      ...current.messages,
      {
        id: `demo-msg-${nextId++}`,
        contactName,
        contactPhone: draft.contactPhone,
        direction: "outbound",
        status: blocked ? "failed" : "sent",
        error: blocked ? "The patient has not written in the last 24 hours, so WhatsApp only allows a template here" : null,
        body,
        templateId: draft.kind === "template" ? draft.templateId : null,
        recoveryItemId: draft.kind === "template" ? draft.recoveryItemId : null,
        automated: false,
        createdAt: now,
        sentAt: blocked ? null : now,
        handledAt: null,
        ai: null,
      },
    ];
    // Replying to someone counts as dealing with their messages.
    if (!blocked) {
      current.messages = current.messages.map((message) =>
        message.direction === "inbound" && message.handledAt === null && samePhone(message.contactPhone, draft.contactPhone)
          ? { ...message, handledAt: now }
          : message,
      );
    }
  },

  markHandled: async (ids: string[]): Promise<void> => {
    await pause();
    const now = new Date().toISOString();
    const current = getState();
    current.messages = current.messages.map((message) => (ids.includes(message.id) ? { ...message, handledAt: now } : message));
  },

  listTemplates: async (): Promise<MessageTemplate[]> => {
    await pause();
    return TEMPLATES.map((template) => ({ ...template }));
  },

  listRules: async (): Promise<AutomationRule[]> => {
    await pause();
    return getState().rules.map((rule) => ({ ...rule }));
  },

  setRuleActive: async (id: string, isActive: boolean): Promise<void> => {
    await pause();
    const current = getState();
    current.rules = current.rules.map((rule) => (rule.id === id ? { ...rule, isActive } : rule));
  },

  getSettings: async (): Promise<ClinicSettings> => {
    await pause();
    return { ...getState().settings };
  },

  saveSettings: async (settings: ClinicSettings): Promise<void> => {
    await pause();
    getState().settings = { ...settings };
  },
};

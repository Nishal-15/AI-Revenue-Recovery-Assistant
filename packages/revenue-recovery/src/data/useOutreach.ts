import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AiReading,
  ApprovalItem,
  Conversation,
  MessageDirection,
  MessageStatus,
  MessageTemplate,
  NewOutboundMessage,
  OutreachMessage,
  ReplyIntent,
} from "../domain/outreach";
import { phoneDigits } from "../domain/outreach";
import type { LeakType } from "../domain/types";
import { useRecoveryContext } from "./context";
import { demoOutreach } from "./demoOutreach";

/** The inbox polls so replies show up without a reload; the engine handles webhooks in real time. */
const INBOX_POLL_MS = 10_000;

const useMode = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return { supabase, clinicId, mode: supabase ? "live" : "demo" } as const;
};

// --- raw rows at the Supabase boundary ------------------------------------------------------

type RawMessage = {
  id: string;
  direction: MessageDirection;
  contact_phone: string;
  body: string | null;
  status: MessageStatus;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  handled_at: string | null;
  template_id: string | null;
  recovery_item_id: string | null;
  automation_rule_id: string | null;
  ai_intent?: ReplyIntent | null;
  ai_confidence?: number | string | null;
  ai_summary?: string | null;
  ai_suggested_reply?: string | null;
};

const toAiReading = (raw: RawMessage): AiReading | null =>
  raw.ai_intent
    ? {
        intent: raw.ai_intent,
        confidence: Number(raw.ai_confidence ?? 0),
        summary: raw.ai_summary ?? null,
        suggestedReply: raw.ai_suggested_reply ?? null,
      }
    : null;

const MESSAGE_COLUMNS =
  "id, direction, contact_phone, body, status, error, created_at, sent_at, handled_at, template_id, recovery_item_id, automation_rule_id, ai_intent, ai_confidence, ai_summary, ai_suggested_reply";

const toMessage = (raw: RawMessage): OutreachMessage => ({
  id: raw.id,
  direction: raw.direction,
  contactPhone: raw.contact_phone,
  body: raw.body,
  status: raw.status,
  error: raw.error,
  createdAt: raw.created_at,
  sentAt: raw.sent_at,
  handledAt: raw.handled_at,
  templateId: raw.template_id,
  recoveryItemId: raw.recovery_item_id,
  automated: raw.automation_rule_id !== null,
  ai: toAiReading(raw),
});

type RawConversation = {
  contact_phone: string;
  contact_name: string;
  last_body: string | null;
  last_direction: MessageDirection;
  last_status: MessageStatus;
  last_at: string;
  last_inbound_at: string | null;
  unhandled_count: number;
};

const toConversation = (raw: RawConversation): Conversation => ({
  contactPhone: raw.contact_phone,
  contactName: raw.contact_name,
  lastBody: raw.last_body,
  lastDirection: raw.last_direction,
  lastStatus: raw.last_status,
  lastAt: raw.last_at,
  lastInboundAt: raw.last_inbound_at,
  unhandledCount: raw.unhandled_count,
});

type RawTemplate = {
  id: string;
  leak_type: LeakType | null;
  name: string;
  whatsapp_template_name: string | null;
  body: string;
  variables: string[];
  buttons: string[];
  is_active: boolean;
};

const toTemplate = (raw: RawTemplate): MessageTemplate => ({
  id: raw.id,
  leakType: raw.leak_type,
  name: raw.name,
  whatsappTemplateName: raw.whatsapp_template_name,
  body: raw.body,
  variables: raw.variables,
  buttons: raw.buttons,
  isActive: raw.is_active,
});

// --- queries --------------------------------------------------------------------------------

export const useConversations = () => {
  const { supabase, clinicId, mode } = useMode();
  return useQuery({
    queryKey: ["recovery", "conversations", clinicId, mode],
    refetchInterval: INBOX_POLL_MS,
    queryFn: async (): Promise<Conversation[]> => {
      if (!supabase) return demoOutreach.listConversations();
      const { data, error } = await supabase
        .schema("recovery")
        .from("conversations")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("last_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(`Could not load conversations: ${error.message}`);
      return (data as RawConversation[]).map(toConversation);
    },
  });
};

export const useThread = (phone: string | null) => {
  const { supabase, clinicId, mode } = useMode();
  return useQuery({
    queryKey: ["recovery", "thread", clinicId, mode, phone ? phoneDigits(phone) : null],
    enabled: phone !== null,
    refetchInterval: INBOX_POLL_MS,
    queryFn: async (): Promise<OutreachMessage[]> => {
      if (!phone) return [];
      if (!supabase) return demoOutreach.listThread(phone);
      const { data, error } = await supabase
        .schema("recovery")
        .rpc("conversation_messages", { p_clinic_id: clinicId, p_phone: phone })
        .select(MESSAGE_COLUMNS);
      if (error) throw new Error(`Could not load messages: ${error.message}`);
      return (data as RawMessage[]).filter((message) => message.status !== "awaiting_approval").map(toMessage);
    },
  });
};

type RawApproval = RawMessage & { recovery_item: { patient_name: string | null } | { patient_name: string | null }[] | null };

const approvalName = (raw: RawApproval): string => {
  const item = Array.isArray(raw.recovery_item) ? raw.recovery_item[0] : raw.recovery_item;
  return item?.patient_name ?? raw.contact_phone;
};

export const useApprovals = () => {
  const { supabase, clinicId, mode } = useMode();
  return useQuery({
    queryKey: ["recovery", "approvals", clinicId, mode],
    refetchInterval: INBOX_POLL_MS,
    queryFn: async (): Promise<ApprovalItem[]> => {
      if (!supabase) return demoOutreach.listApprovals();
      const { data, error } = await supabase
        .schema("recovery")
        .from("outreach_messages")
        .select(`${MESSAGE_COLUMNS}, recovery_item:recovery_items(patient_name)`)
        .eq("clinic_id", clinicId)
        .eq("status", "awaiting_approval")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Could not load messages awaiting approval: ${error.message}`);
      return (data as RawApproval[]).map((raw) => ({ ...toMessage(raw), contactName: approvalName(raw) }));
    },
  });
};

export const useTemplates = () => {
  const { supabase, clinicId, mode } = useMode();
  return useQuery({
    queryKey: ["recovery", "templates", clinicId, mode],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MessageTemplate[]> => {
      if (!supabase) return demoOutreach.listTemplates();
      const { data, error } = await supabase
        .schema("recovery")
        .from("message_templates")
        .select("id, leak_type, name, whatsapp_template_name, body, variables, buttons, is_active")
        .eq("clinic_id", clinicId)
        .order("name");
      if (error) throw new Error(`Could not load templates: ${error.message}`);
      return (data as RawTemplate[]).map(toTemplate);
    },
  });
};

// --- mutations ------------------------------------------------------------------------------

const useInvalidateRecovery = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["recovery"] });
};

/** Queues a message; the engine sends it within a minute, after consent and quiet-hour checks. */
export const useSendMessage = () => {
  const { supabase, clinicId } = useRecoveryContext();
  const invalidate = useInvalidateRecovery();
  return useMutation({
    mutationFn: async (draft: NewOutboundMessage): Promise<void> => {
      if (!supabase) return demoOutreach.send(draft);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .schema("recovery")
        .from("outreach_messages")
        .insert({
          clinic_id: clinicId,
          direction: "outbound",
          channel: "whatsapp",
          contact_phone: draft.contactPhone,
          status: "queued",
          // No scheduled_for: the database stamps the time, so a wrong clock on a staff PC cannot delay sending.
          created_by: auth.user?.id ?? null,
          body: draft.kind === "text" ? draft.text : null,
          template_id: draft.kind === "template" ? draft.templateId : null,
          recovery_item_id: draft.kind === "template" ? draft.recoveryItemId : null,
        });
      if (error) throw new Error(`Could not queue the message: ${error.message}`);
    },
    onSettled: invalidate,
  });
};

export const useApproveMessages = () => {
  const { supabase } = useRecoveryContext();
  const invalidate = useInvalidateRecovery();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      if (!supabase) return demoOutreach.approve(ids);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .schema("recovery")
        .from("outreach_messages")
        .update({ status: "queued", approved_by: auth.user?.id ?? null })
        .in("id", ids)
        .eq("status", "awaiting_approval");
      if (error) throw new Error(`Could not approve: ${error.message}`);
    },
    onSettled: invalidate,
  });
};

export const useCancelMessage = () => {
  const { supabase } = useRecoveryContext();
  const invalidate = useInvalidateRecovery();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!supabase) return demoOutreach.cancel(id);
      const { error } = await supabase
        .schema("recovery")
        .from("outreach_messages")
        .update({ status: "cancelled", error: "Cancelled by staff" })
        .eq("id", id);
      if (error) throw new Error(`Could not cancel: ${error.message}`);
    },
    onSettled: invalidate,
  });
};

/** Deletes a phone number's messages and enquiries and records an opt-out. Owners and managers only. */
export const useForgetContact = () => {
  const { supabase, clinicId } = useRecoveryContext();
  const invalidate = useInvalidateRecovery();
  return useMutation({
    mutationFn: async (phone: string): Promise<void> => {
      if (!supabase) return demoOutreach.forget(phone);
      const { error } = await supabase.schema("recovery").rpc("forget_contact", { p_clinic_id: clinicId, p_phone: phone });
      if (error) {
        const message = error.code === "42501" ? "Only owners and managers can delete a contact's data." : error.message;
        throw new Error(`Could not delete the data: ${message}`);
      }
    },
    onSettled: invalidate,
  });
};

export const useMarkHandled = () => {
  const { supabase } = useRecoveryContext();
  const invalidate = useInvalidateRecovery();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return;
      if (!supabase) return demoOutreach.markHandled(ids);
      const { error } = await supabase
        .schema("recovery")
        .from("outreach_messages")
        .update({ handled_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw new Error(`Could not mark as handled: ${error.message}`);
    },
    onSettled: invalidate,
  });
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutomationRule, AutomationStep, ClinicSettings } from "../domain/outreach";
import { DEFAULT_CLINIC_SETTINGS } from "../domain/outreach";
import type { LeakType } from "../domain/types";
import { useRecoveryContext } from "./context";
import { demoOutreach } from "./demoOutreach";

type RawStep = { anchor?: unknown; offset_minutes?: unknown; template_id?: unknown };

type RawRule = { id: string; leak_type: LeakType; name: string; is_active: boolean; steps: unknown };

/** steps is free-form jsonb; keep only well-formed steps rather than trusting the shape. */
const toSteps = (raw: unknown): AutomationStep[] =>
  Array.isArray(raw)
    ? raw.flatMap((step: RawStep) =>
        (step.anchor === "due" || step.anchor === "detected") &&
        typeof step.offset_minutes === "number" &&
        typeof step.template_id === "string"
          ? [{ anchor: step.anchor, offsetMinutes: step.offset_minutes, templateId: step.template_id }]
          : [],
      )
    : [];

const toRule = (raw: RawRule): AutomationRule => ({
  id: raw.id,
  leakType: raw.leak_type,
  name: raw.name,
  isActive: raw.is_active,
  steps: toSteps(raw.steps),
});

export const useAutomationRules = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useQuery({
    queryKey: ["recovery", "automation-rules", clinicId, supabase ? "live" : "demo"],
    queryFn: async (): Promise<AutomationRule[]> => {
      if (!supabase) return demoOutreach.listRules();
      const { data, error } = await supabase
        .schema("recovery")
        .from("automation_rules")
        .select("id, leak_type, name, is_active, steps")
        .eq("clinic_id", clinicId)
        .order("created_at");
      if (error) throw new Error(`Could not load automations: ${error.message}`);
      return (data as RawRule[]).map(toRule);
    },
  });
};

export const useSetRuleActive = () => {
  const { supabase } = useRecoveryContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }): Promise<void> => {
      if (!supabase) return demoOutreach.setRuleActive(id, isActive);
      const { error } = await supabase.schema("recovery").from("automation_rules").update({ is_active: isActive }).eq("id", id);
      if (error) {
        const message = error.code === "23505" ? "Another sequence for this leak type is already on." : error.message;
        throw new Error(`Could not change the automation: ${message}`);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recovery"] }),
  });
};

type RawSettings = {
  quiet_hours_start: string;
  quiet_hours_end: string;
  max_messages_per_week: number;
  attribution_window_days: number;
  enquiry_response_sla_minutes: number;
  unconfirmed_lookahead_hours: number;
  lapsed_grace_days: number;
  require_staff_approval: boolean;
  whatsapp_phone_number_id: string | null;
};

// Postgres returns "21:00:00"; the form works in "HH:MM".
const toClock = (value: string): string => value.slice(0, 5);

const toSettings = (raw: RawSettings): ClinicSettings => ({
  quietHoursStart: toClock(raw.quiet_hours_start),
  quietHoursEnd: toClock(raw.quiet_hours_end),
  maxMessagesPerWeek: raw.max_messages_per_week,
  attributionWindowDays: raw.attribution_window_days,
  enquiryResponseSlaMinutes: raw.enquiry_response_sla_minutes,
  unconfirmedLookaheadHours: raw.unconfirmed_lookahead_hours,
  lapsedGraceDays: raw.lapsed_grace_days,
  requireStaffApproval: raw.require_staff_approval,
  whatsappPhoneNumberId: raw.whatsapp_phone_number_id,
});

const toSettingsRow = (settings: ClinicSettings) => ({
  quiet_hours_start: settings.quietHoursStart,
  quiet_hours_end: settings.quietHoursEnd,
  max_messages_per_week: settings.maxMessagesPerWeek,
  attribution_window_days: settings.attributionWindowDays,
  enquiry_response_sla_minutes: settings.enquiryResponseSlaMinutes,
  unconfirmed_lookahead_hours: settings.unconfirmedLookaheadHours,
  lapsed_grace_days: settings.lapsedGraceDays,
  require_staff_approval: settings.requireStaffApproval,
  whatsapp_phone_number_id: settings.whatsappPhoneNumberId?.trim() || null,
});

export const useClinicSettings = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useQuery({
    queryKey: ["recovery", "settings", clinicId, supabase ? "live" : "demo"],
    queryFn: async (): Promise<ClinicSettings> => {
      if (!supabase) return demoOutreach.getSettings();
      const { data, error } = await supabase
        .schema("recovery")
        .from("clinic_settings")
        .select(
          "quiet_hours_start, quiet_hours_end, max_messages_per_week, attribution_window_days, enquiry_response_sla_minutes, unconfirmed_lookahead_hours, lapsed_grace_days, require_staff_approval, whatsapp_phone_number_id",
        )
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (error) throw new Error(`Could not load settings: ${error.message}`);
      return data ? toSettings(data as RawSettings) : { ...DEFAULT_CLINIC_SETTINGS };
    },
  });
};

export const useSaveClinicSettings = () => {
  const { supabase, clinicId } = useRecoveryContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: ClinicSettings): Promise<void> => {
      if (!supabase) return demoOutreach.saveSettings(settings);
      const { error } = await supabase
        .schema("recovery")
        .from("clinic_settings")
        .upsert({ clinic_id: clinicId, ...toSettingsRow(settings) }, { onConflict: "clinic_id" });
      if (error) {
        const message = error.code === "42501" ? "Only owners and managers can change settings." : error.message;
        throw new Error(`Could not save settings: ${message}`);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["recovery"] }),
  });
};

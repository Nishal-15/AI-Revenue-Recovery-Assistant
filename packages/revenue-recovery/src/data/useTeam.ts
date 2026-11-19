import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRecoveryContext } from "./context";

export type StaffRole = "owner" | "manager" | "dentist" | "front_desk";

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  dentist: "Dentist",
  front_desk: "Front desk",
};

export type TeamMember = { userId: string; fullName: string; role: StaffRole; email: string; joinedAt: string; isYou: boolean };

export type ClinicProfile = {
  name: string;
  phone: string;
  whatsappNumber: string;
  address: string;
  timezone: string;
  currency: string;
};

type RawMember = { user_id: string; full_name: string; role: StaffRole; email: string | null; joined_at: string; is_you: boolean };

export const useTeam = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useQuery({
    queryKey: ["recovery", "team", clinicId],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase.schema("recovery").rpc("team_members", { p_clinic_id: clinicId });
      if (error) throw new Error(`Could not load the team: ${error.message}`);
      return (data as RawMember[]).map((raw) => ({
        userId: raw.user_id,
        fullName: raw.full_name,
        role: raw.role,
        email: raw.email ?? "",
        joinedAt: raw.joined_at,
        isYou: raw.is_you,
      }));
    },
  });
};

/** The signed-in person's role, so screens can hide what they aren't allowed to change. */
export const useMyRole = (): StaffRole | null => {
  const team = useTeam();
  return team.data?.find((member) => member.isYou)?.role ?? null;
};

export const canManage = (role: StaffRole | null): boolean => role === "owner" || role === "manager";

const useTeamMutation = <Input>(run: (input: Input) => Promise<void>) => {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSettled: () => queryClient.invalidateQueries({ queryKey: ["recovery"] }) });
};

export const useAddTeamMember = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useTeamMutation(async (input: { email: string; fullName: string; role: StaffRole }) => {
    const { error } = await supabase.schema("recovery").rpc("add_team_member", {
      p_clinic_id: clinicId,
      p_email: input.email.trim(),
      p_full_name: input.fullName.trim(),
      p_role: input.role,
    });
    if (error) throw new Error(error.message);
  });
};

export const useRemoveTeamMember = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useTeamMutation(async (userId: string) => {
    const { error } = await supabase.schema("recovery").rpc("remove_team_member", { p_clinic_id: clinicId, p_user_id: userId });
    if (error) throw new Error(error.message);
  });
};

type RawClinic = { name: string; phone: string | null; whatsapp_number: string | null; address: string | null; timezone: string; currency: string };

export const useClinicProfile = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useQuery({
    queryKey: ["recovery", "clinic-profile", clinicId],
    queryFn: async (): Promise<ClinicProfile> => {
      const { data, error } = await supabase
        .schema("recovery")
        .from("clinics")
        .select("name, phone, whatsapp_number, address, timezone, currency")
        .eq("id", clinicId)
        .single();
      if (error) throw new Error(`Could not load the clinic: ${error.message}`);
      const raw = data as RawClinic;
      return {
        name: raw.name,
        phone: raw.phone ?? "",
        whatsappNumber: raw.whatsapp_number ?? "",
        address: raw.address ?? "",
        timezone: raw.timezone,
        currency: raw.currency.trim(),
      };
    },
  });
};

export const useSaveClinicProfile = () => {
  const { supabase, clinicId } = useRecoveryContext();
  return useTeamMutation(async (profile: ClinicProfile) => {
    const { data, error } = await supabase
      .schema("recovery")
      .from("clinics")
      .update({
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
        whatsapp_number: profile.whatsappNumber.trim() || null,
        address: profile.address.trim() || null,
        timezone: profile.timezone,
      })
      .eq("id", clinicId)
      .select("id");
    if (error) throw new Error(`Could not save: ${error.message}`);
    if (!data || data.length === 0) throw new Error("Only owners and managers can change the clinic details.");
  });
};

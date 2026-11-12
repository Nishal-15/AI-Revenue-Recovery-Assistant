import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecoveryContextProvider } from "./data/context";
import { ModuleShell } from "./features/shell/ModuleShell";
import type { SectionId } from "./features/shell/sections";

export type RevenueRecoveryProps = {
  /** The dental OS's existing Supabase client (same project, same logged-in user). Omit for demo data. */
  supabase?: SupabaseClient;
  clinicId: string;
  /** ISO 4217 code used for every money figure. */
  currency?: string;
  /** Lets the host keep the section in its own router; uncontrolled when omitted. */
  section?: SectionId;
  onSectionChange?: (section: SectionId) => void;
};

export const RevenueRecovery = ({
  supabase,
  clinicId,
  currency = "INR",
  section: controlledSection,
  onSectionChange,
}: RevenueRecoveryProps) => {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } } }),
  );
  const [localSection, setLocalSection] = useState<SectionId>("dashboard");
  const section = controlledSection ?? localSection;

  const contextValue = useMemo(
    () => ({ supabase: supabase ?? null, clinicId, currency }),
    [supabase, clinicId, currency],
  );

  const changeSection = (next: SectionId) => {
    setLocalSection(next);
    onSectionChange?.(next);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <RecoveryContextProvider value={contextValue}>
        <div className="rr-root min-h-full">
          <ModuleShell section={section} onSectionChange={changeSection} />
        </div>
      </RecoveryContextProvider>
    </QueryClientProvider>
  );
};

import { createContext, useContext, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type RecoveryContextValue = {
  clinicId: string;
  currency: string;
  supabase: SupabaseClient;
};

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export const RecoveryContextProvider = ({ value, children }: { value: RecoveryContextValue; children: ReactNode }) => (
  <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>
);

export const useRecoveryContext = (): RecoveryContextValue => {
  const value = useContext(RecoveryContext);
  if (!value) throw new Error("useRecoveryContext must be used inside <RevenueRecovery />");
  return value;
};

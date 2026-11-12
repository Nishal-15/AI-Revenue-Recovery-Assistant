import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { RevenueRecovery } from "@dental-os/revenue-recovery";
import "./host.css";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const clinicId = (import.meta.env.VITE_CLINIC_ID as string | undefined) ?? "00000000-0000-0000-0000-00000000c001";
const supabase = url && anonKey ? createClient(url, anonKey) : undefined;

const HostSidebar = () => (
  <aside className="host-sidebar">
    <strong style={{ color: "#0b7f7b" }}>Dental OS</strong>
    <p style={{ color: "#8193a3", fontSize: 13, marginTop: 24 }}>Patients · Calendar · Billing</p>
    <p style={{ color: "#0b7f7b", fontSize: 13, fontWeight: 600 }}>Revenue Recovery</p>
  </aside>
);

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <div className="host-layout">
      <HostSidebar />
      <div className="host-content">
        <RevenueRecovery supabase={supabase} clinicId={clinicId} />
      </div>
    </div>
  </StrictMode>,
);

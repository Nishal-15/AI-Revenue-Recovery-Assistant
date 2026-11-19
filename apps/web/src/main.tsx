import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClinicApp } from "./pages/ClinicApp";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { usePath } from "./lib/router";
import "./styles.css";

const TITLES: Record<string, string> = {
  "/login": "Sign in · Revenue Recovery",
  "/app": "Today · Revenue Recovery",
};

const App = () => {
  const path = usePath().replace(/\/+$/, "") || "/";
  document.title = TITLES[path] ?? "Revenue Recovery · Win back missed dental bookings";
  if (path === "/login") return <LoginPage />;
  if (path === "/app") return <ClinicApp />;
  return <LandingPage />;
};

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

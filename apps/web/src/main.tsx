import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AccountPage } from "./pages/AccountPage";
import { ClinicApp } from "./pages/ClinicApp";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage, PrivacyPage, TermsPage } from "./pages/LegalPages";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordPages";
import { SignupPage } from "./pages/SignupPage";
import { usePath } from "./lib/router";
import "./styles.css";

const ROUTES: Record<string, { title: string; page: () => ReactNode }> = {
  "/": { title: "Revenue Recovery · Win back missed dental bookings", page: LandingPage },
  "/login": { title: "Sign in · Revenue Recovery", page: LoginPage },
  "/signup": { title: "Create your account · Revenue Recovery", page: SignupPage },
  "/forgot-password": { title: "Reset your password · Revenue Recovery", page: ForgotPasswordPage },
  "/reset-password": { title: "Choose a new password · Revenue Recovery", page: ResetPasswordPage },
  "/onboarding": { title: "Set up your clinic · Revenue Recovery", page: OnboardingPage },
  "/app": { title: "Today · Revenue Recovery", page: ClinicApp },
  "/account": { title: "Your account · Revenue Recovery", page: AccountPage },
  "/privacy": { title: "Privacy policy · Revenue Recovery", page: PrivacyPage },
  "/terms": { title: "Terms of use · Revenue Recovery", page: TermsPage },
};

const NOT_FOUND = { title: "Page not found · Revenue Recovery", page: NotFoundPage };

const App = () => {
  const path = usePath().replace(/\/+$/, "") || "/";
  const route = ROUTES[path] ?? NOT_FOUND;
  useEffect(() => {
    document.title = route.title;
  }, [route]);
  const Page = route.page;
  return <Page />;
};

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

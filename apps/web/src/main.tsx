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
import { BRAND } from "./lib/brand";

const ROUTES: Record<string, { title: string; page: () => ReactNode }> = {
  "/": { title: `${BRAND} · Win back missed dental bookings`, page: LandingPage },
  "/login": { title: `Sign in · ${BRAND}`, page: LoginPage },
  "/signup": { title: `Create your account · ${BRAND}`, page: SignupPage },
  "/forgot-password": { title: `Reset your password · ${BRAND}`, page: ForgotPasswordPage },
  "/reset-password": { title: `Choose a new password · ${BRAND}`, page: ResetPasswordPage },
  "/onboarding": { title: `Set up your clinic · ${BRAND}`, page: OnboardingPage },
  "/app": { title: `Today · ${BRAND}`, page: ClinicApp },
  "/account": { title: `Your account · ${BRAND}`, page: AccountPage },
  "/privacy": { title: `Privacy policy · ${BRAND}`, page: PrivacyPage },
  "/terms": { title: `Terms of use · ${BRAND}`, page: TermsPage },
};

const NOT_FOUND = { title: `Page not found · ${BRAND}`, page: NotFoundPage };

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

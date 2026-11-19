import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Logo } from "./Logo";
import { Link, navigate } from "../lib/router";
import { supabase } from "../lib/supabase";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

export const signOut = async () => {
  await supabase?.auth.signOut();
  navigate("/login");
};

/** The bar above the clinic screens: brand, clinic, and the person's own menu. */
export const AppHeader = ({ clinicName, staffName, email }: { clinicName?: string; staffName?: string; email?: string }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const name = staffName ?? email ?? "Account";

  return (
    <header className="sticky top-0 z-20 border-b border-rr-canvas-line bg-rr-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/app" aria-label="Revenue Recovery, today">
            <Logo />
          </Link>
          {clinicName && (
            <span className="hidden truncate rounded-full border border-rr-canvas-line px-3 py-1 text-sm text-rr-on-canvas-soft md:block">
              {clinicName}
            </span>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="menu"
            className="flex h-11 items-center gap-2 rounded-full border border-rr-canvas-line bg-white/5 py-1 pr-3 pl-1 transition-colors hover:bg-white/10"
          >
            <span className="grid size-9 place-items-center rounded-full bg-rr-surface text-sm font-bold text-rr-ink">{initials(name)}</span>
            <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{name}</span>
            <ChevronDown size={16} className="text-rr-on-canvas-soft" aria-hidden />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-3xl bg-rr-surface p-2 text-rr-ink shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)]">
              <div className="px-3 py-2.5">
                <p className="truncate font-semibold">{name}</p>
                {email && <p className="truncate text-sm text-rr-ink-soft">{email}</p>}
              </div>
              <Link
                href="/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 hover:bg-rr-bg"
              >
                <UserRound size={17} aria-hidden /> Your account
              </Link>
              <button type="button" role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left hover:bg-rr-bg">
                <LogOut size={17} aria-hidden /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

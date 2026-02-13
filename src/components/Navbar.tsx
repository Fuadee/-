"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const navLinks = [
  { href: "/", label: "Generate" },
  { href: "/doc", label: "Doc" }
];

export default function Navbar() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    const loadUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setAuthState({ user, loading: false });
    };

    loadUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event: string, session: { user: User } | null) => {
      setAuthState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    setAuthState({ user: null, loading: false });
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/70 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="group inline-flex items-center gap-2 transition-opacity hover:opacity-90">
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-400 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]" />
          <span className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-sm font-semibold tracking-wide text-transparent sm:text-base">
            DOCX Generator
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full bg-slate-100 px-2 py-1 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-white/70 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {authState.loading ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">Loading...</span>
          ) : authState.user ? (
            <>
              <span className="max-w-44 truncate rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {authState.user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:from-slate-800 hover:to-slate-600"
            >
              Login
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:hidden"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
          >
            Menu
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div id="mobile-nav" className="border-t border-slate-200 bg-white/90 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const navLinks = [
  { href: "/", label: "Generate" },
  { href: "/dashboard", label: "Dashboard" }
];

export default function Navbar() {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true
  });

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
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--border)]/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-full px-1 py-1">
          <span className="relative inline-flex h-3 w-3">
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400" />
            <span className="absolute -inset-1.5 rounded-full bg-violet-400/40 blur-sm" />
          </span>
          <span className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-sm font-semibold tracking-[0.02em] text-transparent sm:text-base">
            DOCX Generator
          </span>
        </Link>

        <nav
          className="order-3 flex w-full items-center gap-1 rounded-full border border-[color:var(--border)] bg-white/85 p-1 shadow-[var(--soft-shadow)] sm:order-2 sm:w-auto"
          aria-label="Primary"
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`focus-ring flex-1 rounded-full px-4 py-1.5 text-center text-sm font-medium transition sm:flex-none ${
                  isActive
                    ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_8px_20px_rgba(124,58,237,0.28)]"
                    : "text-slate-700 hover:bg-purple-50 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-2 flex items-center gap-2 sm:order-3">
          {authState.loading ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500">Loading...</span>
          ) : authState.user ? (
            <>
              <span className="inline-flex max-w-48 items-center gap-2 rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm sm:text-sm">
                <span className="h-2 w-2 rounded-full bg-violet-500/80" />
                <span className="truncate">{authState.user.email}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="focus-ring rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 sm:text-sm"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="focus-ring rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

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
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]" />
          <span className="bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-sm font-semibold tracking-wide text-transparent sm:text-base">
            DOCX Generator
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 p-1 md:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {authState.loading ? (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500">Loading...</span>
          ) : authState.user ? (
            <>
              <span className="max-w-44 truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700">
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
              className="rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type AuthState = {
  user: User | null;
  loading: boolean;
};

type LineTestResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type FeedbackState = {
  type: "success" | "error";
  message: string;
} | null;

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLineTestLoading, setIsLineTestLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleTestLine = async () => {
    if (isLineTestLoading) {
      return;
    }

    setIsLineTestLoading(true);

    try {
      const response = await fetch("/api/line/test", {
        method: "POST"
      });

      const body = (await response.json().catch(() => null)) as LineTestResponse | null;

      if (!response.ok || !body?.ok) {
        const errorMessage = body?.error?.trim() || body?.message?.trim() || "ไม่สามารถส่งข้อความทดสอบ LINE ได้ในขณะนี้";
        setFeedback({
          type: "error",
          message: errorMessage
        });
        return;
      }

      setFeedback({
        type: "success",
        message: "ส่งข้อความทดสอบ LINE สำเร็จ"
      });
      setIsMenuOpen(false);
    } catch {
      setFeedback({
        type: "error",
        message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง"
      });
    } finally {
      setIsLineTestLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--border)]/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="focus-ring inline-flex items-center gap-2 rounded-full px-1 py-1"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            disabled={isLineTestLoading}
          >
            <span className="relative inline-flex h-3 w-3">
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400" />
              <span className="absolute -inset-1.5 rounded-full bg-violet-400/40 blur-sm" />
            </span>
            <span className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-sm font-semibold tracking-[0.02em] text-transparent sm:text-base">
              DOCX Generator
            </span>
          </button>

          {isMenuOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-56 rounded-2xl border border-[color:var(--border)] bg-white p-2 shadow-[var(--soft-shadow)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleTestLine}
                disabled={isLineTestLoading}
                aria-busy={isLineTestLoading}
                className="focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>Test LINE</span>
                {isLineTestLoading ? <span className="text-xs text-slate-500">Sending...</span> : null}
              </button>
            </div>
          ) : null}
        </div>

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

      {feedback ? (
        <div className="pointer-events-none fixed right-4 top-20 z-[60] max-w-sm rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 shadow-[var(--soft-shadow)]">
          <p className={`text-sm ${feedback.type === "success" ? "text-emerald-700" : "text-rose-700"}`}>{feedback.message}</p>
        </div>
      ) : null}
    </header>
  );
}

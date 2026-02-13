"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type AuthState = {
  user: User | null;
  loading: boolean;
};

export default function Navbar() {
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
    setAuthState({ user: null, loading: false });
  };

  return (
    <nav style={{ display: "flex", gap: "1rem", alignItems: "center", padding: "0.75rem 1rem", borderBottom: "1px solid #d1d5db", background: "white" }}>
      <Link href="/" style={{ fontWeight: 700 }}>
        DOCX Generator
      </Link>
      <Link href="/doc">Doc</Link>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {authState.loading ? (
          <span>Loading...</span>
        ) : authState.user ? (
          <>
            <span>{authState.user.email}</span>
            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}

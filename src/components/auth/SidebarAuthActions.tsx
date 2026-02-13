"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SidebarAuthActionsProps = {
  initialEmail: string | null;
};

export function SidebarAuthActions({ initialEmail }: SidebarAuthActionsProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [email, setEmail] = useState<string | null>(initialEmail);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setIsLoading(false);
    router.push("/login");
    router.refresh();
  };

  if (!email) {
    return <Link href="/login">เข้าสู่ระบบ</Link>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <small style={{ color: "#374151", wordBreak: "break-word" }}>{email}</small>
      <button type="button" onClick={signOut} disabled={isLoading}>
        {isLoading ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
      </button>
    </div>
  );
}

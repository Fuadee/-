"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthSidebarActions() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const readUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      setEmail(user?.email ?? null);
      setLoading(false);
    };

    void readUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    setEmail(null);
    router.push("/login");
    router.refresh();
  };

  if (loading) {
    return <p style={{ color: "#6b7280" }}>กำลังตรวจสอบสถานะผู้ใช้...</p>;
  }

  if (!email) {
    return (
      <Link href="/login" style={{ display: "inline-block", marginTop: 8 }}>
        เข้าสู่ระบบ
      </Link>
    );
  }

  return (
    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
      <p style={{ margin: 0, wordBreak: "break-word" }}>ผู้ใช้: {email}</p>
      <button type="button" onClick={onSignOut} style={{ width: "fit-content" }}>
        ออกจากระบบ
      </button>
    </div>
  );
}

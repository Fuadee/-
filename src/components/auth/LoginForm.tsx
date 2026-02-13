"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Notice = {
  type: "success" | "error";
  text: string;
};

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const searchParams = useSearchParams();

  const redirectPath = useMemo(() => {
    const raw = searchParams.get("redirect") || "/procure";
    return raw.startsWith("/") ? raw : "/procure";
  }, [searchParams]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    const supabase = createSupabaseBrowserClient();
    const redirectUrl = new URL("/auth/callback", window.location.origin);
    redirectUrl.searchParams.set("redirect", redirectPath);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl.toString()
      }
    });

    if (error) {
      setNotice({ type: "error", text: `ส่งลิงก์ไม่สำเร็จ: ${error.message}` });
      setLoading(false);
      return;
    }

    setNotice({
      type: "success",
      text: "ส่งลิงก์เข้าสู่ระบบแล้ว กรุณาตรวจสอบอีเมลของคุณ"
    });
    setLoading(false);
  };

  return (
    <section style={{ maxWidth: 460 }}>
      <h1>เข้าสู่ระบบ</h1>
      <p>กรอกอีเมลเพื่อรับลิงก์เข้าสู่ระบบ (Magic link)</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          style={{ padding: "10px 12px" }}
        />

        <button type="submit" disabled={loading} style={{ padding: "10px 12px" }}>
          {loading ? "กำลังส่ง..." : "ส่งลิงก์เข้าสู่ระบบ (Magic link)"}
        </button>
      </form>

      {notice && (
        <p
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: notice.type === "success" ? "#ecfdf5" : "#fef2f2",
            color: notice.type === "success" ? "#065f46" : "#991b1b"
          }}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}

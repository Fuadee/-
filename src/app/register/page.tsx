"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("ยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setIsLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password
    });

    setIsLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      setSuccess("สมัครสมาชิกสำเร็จ กำลังพาไปหน้ารายการงาน...");
      router.push("/procure");
      router.refresh();
      return;
    }

    setSuccess("สมัครสมาชิกสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ");
  };

  return (
    <section style={{ maxWidth: 420 }}>
      <h1>สมัครสมาชิก</h1>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          อีเมล
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          รหัสผ่าน
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          ยืนยันรหัสผ่าน
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        {success ? <p style={{ color: "#15803d", margin: 0 }}>{success}</p> : null}

        <button type="submit" disabled={isLoading}>
          {isLoading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
        </button>
      </form>

      <p>
        มีบัญชีอยู่แล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
      </p>
    </section>
  );
}

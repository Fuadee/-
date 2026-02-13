"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import styles from "./LoginForm.module.css";

export default function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
    setLoading(false);
  };

  return (
    <section className={styles.wrapper}>
      <div aria-hidden className={styles.glow} />

      <form onSubmit={handleSignIn} className={styles.card}>
        <header>
          <h1 className={styles.heading}>เข้าสู่ระบบ</h1>
          <p className={styles.subtext}>ใช้อีเมลและรหัสผ่านเพื่อเข้าสู่โปรไฟล์ของคุณ</p>
        </header>

        <label htmlFor="email" className={styles.field}>
          อีเมล
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className={styles.input}
          />
        </label>

        <label htmlFor="password" className={styles.field}>
          รหัสผ่าน
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className={styles.input}
          />
        </label>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" disabled={loading} className={`${styles.button} ${styles.primary}`}>
          เข้าสู่ระบบ
        </button>

        <button
          type="button"
          onClick={handleSignUp}
          disabled={loading}
          className={`${styles.button} ${styles.secondary}`}
        >
          ลงทะเบียน
        </button>
      </form>
    </section>
  );
}

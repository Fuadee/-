"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

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
    setMessage(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setMessage("Sign-up successful. Check your email for a confirmation link if required.");
    setLoading(false);
  };

  return (
    <section style={{ maxWidth: 420, margin: "2rem auto", padding: "1rem", background: "white", border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <h1 style={{ marginTop: 0 }}>Login</h1>
      <form onSubmit={handleSignIn} style={{ display: "grid", gap: "0.75rem" }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        {message ? <p style={{ color: "#047857", margin: 0 }}>{message}</p> : null}

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={loading}>
            Sign in
          </button>
          <button type="button" onClick={handleSignUp} disabled={loading}>
            Sign up
          </button>
        </div>
      </form>
    </section>
  );
}

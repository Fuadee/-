import { createSupabaseServer } from "@/lib/supabase/server";

export default async function DocPage() {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <section style={{ padding: "1.5rem" }}>
      <h1>Generate Doc</h1>
      <p>Protected area for document generation workflows.</p>
      {user?.email ? <p>Signed in as: {user.email}</p> : null}
    </section>
  );
}

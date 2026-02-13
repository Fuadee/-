import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return <LoginForm />;
}

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getServerSession = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return session;
};

export const getServerUser = async () => {
  const session = await getServerSession();
  return session?.user ?? null;
};

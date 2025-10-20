"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import CreateBusiness from "@/components/ui/authorizebusiness";

export default function StartPage() {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email ?? "");

      // Prefer server-side profile, fall back to metadata, then email
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, display_name, first_name, last_name")
        .eq("id", user.id)
        .single();

      const metaName = [user.user_metadata?.first_name, user.user_metadata?.last_name]
        .filter(Boolean)
        .join(" ");

      const resolved =
        profile?.full_name ||
        profile?.display_name ||
        metaName ||
        user.email ||
        "";

      setDisplayName(resolved);
    };
    load();
  }, [supabase]);

  const router = useRouter();

  const handleContinue = () => {
    // Proceed to the next onboarding step. Update the route if you have a specific next page.
    router.push('/employeronboarding/userinfo');
  };

  return (
    <CreateBusiness
      email={email}
      displayName={displayName}
      onContinue={handleContinue}
    />
  );
}

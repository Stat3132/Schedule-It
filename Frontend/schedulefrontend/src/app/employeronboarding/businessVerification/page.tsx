"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import CreateBusiness from "@/components/ui/authorizebusiness";

export default function BusinessVerificationPage() {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const cachedEmail = localStorage.getItem("pendingEmail") || "";
      const cachedName  = localStorage.getItem("pendingName")  || "";

      const { data: { user } } = await supabase.auth.getUser();

      // default to cached when no session
      const nextEmail = user?.email ?? cachedEmail;
      let nextName  = cachedName || nextEmail;

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, display_name, first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        const metaName = [user.user_metadata?.first_name, user.user_metadata?.last_name]
          .filter(Boolean).join(" ");

        nextName =
          profile?.full_name ||
          profile?.display_name ||
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
          metaName ||
          cachedName ||
          nextEmail;
      }

      if (!alive) return;
      setEmail(nextEmail);
      setDisplayName(nextName);
    })();
    return () => { alive = false; };
  }, [supabase]);

  const router = useRouter();

 const [msg, setMsg] = useState<string | null>(null);

const handleContinue = async ({ timezone, isOwner }: { timezone: string; isOwner: boolean }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("business")
    .insert({ owner_user_id: user.id, timezone, name: `${displayName}'s Business` })
    .select("id")
    .single();
  if (error) throw error;

  router.push(`/employeronboarding/businessDocumentation/${data.id}`);
};


  return (
    <CreateBusiness
      email={email}
      displayName={displayName}
      onContinue={handleContinue}
    />
  );
}

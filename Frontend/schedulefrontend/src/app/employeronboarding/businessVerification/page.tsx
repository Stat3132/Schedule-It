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

    const emailVal = user?.email ?? cachedEmail;

    let nameVal =
      cachedName ||
      emailVal;

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, display_name, first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();

      const metaName = [user.user_metadata?.first_name, user.user_metadata?.last_name]
        .filter(Boolean).join(" ");

      nameVal =
        profile?.full_name ||
        profile?.display_name ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        metaName ||
        cachedName ||
        emailVal;
    }

    if (!alive) return;
    setEmail(emailVal);
    setDisplayName(nameVal);
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
  if (error) { console.error(error); throw error; }
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

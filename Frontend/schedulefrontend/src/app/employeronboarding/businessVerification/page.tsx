"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import CreateBusiness from "@/components/ui/authorizebusiness";

export default function BusinessVerificationPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null); // null = loading
  const [err, setErr] = useState<string | null>(null);

  // session gate
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      setAuthed(!!session);
    })();
    return () => { alive = false; };
  }, [supabase]);

  // preload display info
  useEffect(() => {
    let alive = true;
    (async () => {
      const cachedEmail = localStorage.getItem("pendingEmail") || "";
      const cachedName  = localStorage.getItem("pendingName")  || "";
      const { data: { user } } = await supabase.auth.getUser();

      const emailVal = user?.email ?? cachedEmail;
      let nameVal = cachedName || emailVal;

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

  // create + route
  const handleContinue = async ({ timezone }: { timezone: string; isOwner: boolean }) => {
    setErr(null);
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

  // session-required UI
  if (authed === null) return <div className="p-6">Loading…</div>;
  if (!authed) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md w-full space-y-4">
          <h1 className="text-2xl font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground">Confirm your email or sign in to continue.</p>
          <div className="flex gap-2">
            <button
            className="px-4 py-2 bg-blue-600 text-white rounded"
            onClick={async () => {
              setErr(null);
              if (!email) { setErr("No email available."); return; }

              const origin = window.location.origin;
              const next = encodeURIComponent("/employeronboarding/businessVerification");
              const { error } = await supabase.auth.signInWithOtp({
                email,
                options: { emailRedirectTo: `${origin}/auth/callback?next=${next}` },
              });

              if (error) setErr(error.message);
              else setErr("Check your email for the link.");
            }}
          >
            Send magic link
          </button>


            <button
              className="px-4 py-2 border rounded"
              onClick={() => router.push("/signin")}
            >
              Go to sign in
            </button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <CreateBusiness
      email={email}
      displayName={displayName}
      onContinue={handleContinue}
    />
  );
}

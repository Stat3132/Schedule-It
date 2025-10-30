"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function Bootstrap() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }

      const ownerId = session.user.id;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // reuse most recent business if one exists
      const { data: existing, error: exErr } = await supabase
        .from("business")
        .select("id")
        .eq("owner_user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (exErr) { setErr(exErr.message); return; }

      let bizId = existing?.id;
      if (!bizId) {
        // create a default business
        const display = [
          session.user.user_metadata?.first_name,
          session.user.user_metadata?.last_name,
        ].filter(Boolean).join(" ") || "My";

        const { data, error } = await supabase
          .from("business")
          .insert({
            name: `${display}'s Business`,
            timezone: tz,
            owner_user_id: ownerId,     // must equal auth.uid() due to RLS + FK
            settings_json: {},
          })
          .select("id")
          .single();

        if (error) { setErr(error.message); return; }
        bizId = data.id;
      }

      router.replace(`/employeronboarding/businessDocumentation/${bizId}`);
    })();
  }, [router, supabase]);

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <p className="text-lg">Finishing sign-in…</p>
        <p className="text-sm opacity-70">Setting up your business</p>
        {err && <p className="mt-4 text-red-600">{err}</p>}
      </div>
    </div>
  );
}

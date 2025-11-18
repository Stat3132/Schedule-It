// app/employeronboarding/bootstrap/page.tsx
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

      // Ensure the owner has an employment row and an "Owner" role in this business.
      try {
        // find or create an Owner role for this business
        const { data: existingRole } = await supabase
          .from("role")
          .select("id")
          .eq("business_id", bizId)
          .eq("name", "Owner")
          .maybeSingle();

        let ownerRoleId = existingRole?.id;
        if (!ownerRoleId) {
          const { data: newRole, error: roleErr } = await supabase
            .from("role")
            .insert({ business_id: bizId, name: "Owner", color: "#111827" })
            .select("id")
            .single();
          if (roleErr) {
            console.error("create owner role", roleErr);
          } else {
            ownerRoleId = newRole.id;
          }
        }

        // upsert the owner's employment row (makes owner a manager/admin)
        const ownerEmployment = {
          user_id: ownerId,
          business_id: bizId,
          location_id: null,
          role_id: ownerRoleId ?? null,
          status: "active",
          is_manager: true,
          is_admin: true,
          permissions: {},
        };

        const { error: empErr } = await supabase
          .from("employment")
          .upsert([ownerEmployment], { onConflict: "user_id,business_id" });
        if (empErr) {
          console.error("ensure owner employment", empErr);
        }
      } catch (e) {
        console.error("owner employment setup error", e);
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

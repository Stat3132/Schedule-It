"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useI18n } from "../lib/i18n";

export default function EmployeeBusinessGate({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { t } = useI18n();

  const [checking, setChecking] = useState(true);
  const [hasEmployment, setHasEmployment] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setChecking(true);
      setErrorMsg(null);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (!alive) return;
        if (authError) throw authError;
        if (!authData.user) {
          router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("employment")
          .select("id,business_id")
          .eq("user_id", authData.user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (!alive) return;
        if (error && error.code !== "PGRST116") throw error;
        setHasEmployment(Boolean(data));
      } catch (err) {
        console.error("EmployeeBusinessGate error", err);
        if (!alive) return;
        setErrorMsg(err instanceof Error ? err.message : String(err ?? "error"));
        setHasEmployment(null);
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [supabase, router, retryKey]);

  if (checking) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-sm text-foreground/70">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        {t("shared.state.loading")}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employee.guard.errors.generic")}
          </h1>
          <p className="text-sm text-foreground/70 break-words">{errorMsg}</p>
          <button
            type="button"
            className="w-full rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            {t("employee.guard.buttons.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (hasEmployment === false) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("employee.schedule.gate.heading")}
          </h1>
          <p className="text-sm text-foreground/70">
            {t("employee.schedule.gate.body")}
          </p>
          <button
            type="button"
            className="w-full rounded-xl bg-primary px-4 py-2 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90"
            onClick={() => router.push("/business-selection")}
          >
            {t("employee.schedule.gate.cta")}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

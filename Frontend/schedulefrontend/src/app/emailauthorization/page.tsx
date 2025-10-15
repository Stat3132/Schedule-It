"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SmsVerification } from "@/components/ui/SmsVerification";

export default function emailauthorization() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Loading…</div>}>
      <EmailAuthorizationClient />
    </Suspense>
  );
}

function EmailAuthorizationClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const verificationId = sp.get("verificationId") ?? "";

  return (
    <SmsVerification
      verificationId={verificationId}
      onVerified={() => router.push("/")}
      onBack={() => router.back()}
    />
  );
}

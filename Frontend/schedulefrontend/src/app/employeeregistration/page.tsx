"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SmsVerification } from "@/components/ui/SmsVerification";

export default function EmailAuthorizationPage() {
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

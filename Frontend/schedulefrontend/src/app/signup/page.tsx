import React, { Suspense } from "react";
import SignUpClient from "../../components/SignUpClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <SignUpClient />
    </Suspense>
  );
}

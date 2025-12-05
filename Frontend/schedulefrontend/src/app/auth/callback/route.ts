// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // Supabase may send either:
  //  - ?code=...                    (OAuth, magic link)
  //  - ?token_hash=...&type=signup  (email/password confirmation)
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type") as EmailOtpType | null;

  const next = url.searchParams.get("next") ?? "/";

  // Pass the cookies function directly (this is what the helper expects)
  const supabase = createRouteHandlerClient({ cookies });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("exchangeCodeForSession error in /auth/callback:", error);
    }
  } else if (token_hash && typeParam) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: typeParam,
    });
    if (error) {
      console.error("verifyOtp error in /auth/callback:", error);
    }
  }

  // Decode "next" robustly (handles single/double encoding)
  const target = (() => {
    if (!next) return "/";
    try {
      const first = decodeURIComponent(next);
      try {
        const second = decodeURIComponent(first);
        if (second !== first) return second;
      } catch {
        // ignore and use first
      }
      return first;
    } catch {
      return next ?? "/";
    }
  })();

  return NextResponse.redirect(new URL(target, url.origin));
}

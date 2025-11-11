import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createRouteHandlerClient({ cookies }); // correct
    await supabase.auth.exchangeCodeForSession(code);
  }

  // next may be URL-encoded by the caller (eg. encodeURIComponent). Decode safely.
  const target = (() => {
    try {
      return next ? decodeURIComponent(next) : "/";
    } catch (e) {
      return next ?? "/";
    }
  })();

  return NextResponse.redirect(new URL(target, url.origin));
}

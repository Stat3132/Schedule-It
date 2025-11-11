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

  // next may be URL-encoded by the caller (eg. encodeURIComponent) and may have been
  // encoded again by intermediate redirects. Try decoding once, then fall back to
  // attempting a second decode if the first result still looks encoded. Use try/catch
  // so malformed values don't throw.
  const target = (() => {
    if (!next) return "/";
    try {
      const first = decodeURIComponent(next);
      try {
        // If decoding again succeeds and changes the value, prefer the double-decoded value.
        const second = decodeURIComponent(first);
        if (second !== first) return second;
      } catch (_e) {
        // ignore and return first
      }
      return first;
    } catch (e) {
      return next ?? "/";
    }
  })();

  return NextResponse.redirect(new URL(target, url.origin));
}

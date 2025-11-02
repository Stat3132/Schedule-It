// app/api/invitations/route.ts
import { NextResponse } from "next/server";
// import { cookies } from "next/headers";
// import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const { businessId, invites } = await req.json();

    if (!businessId || !Array.isArray(invites) || invites.length === 0) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // TODO: auth check with Supabase if needed
    // const supabase = createRouteHandlerClient({ cookies });

    // TODO: create invitation rows + tokens. Return join URLs.
    const out = invites.map((x: any) => ({
      email: x.email,
      joinUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/employeeregistration?biz=${encodeURIComponent(
        businessId
      )}&email=${encodeURIComponent(x.email)}`,
    }));

    return NextResponse.json({ invites: out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}

// Optional: reject other verbs with JSON
export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

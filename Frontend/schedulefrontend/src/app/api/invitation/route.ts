import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { BASE_URL, sendInviteEmail } from "@/lib/resend";

export const runtime = "nodejs";

const InvitePayload = z.object({
  businessId: z.string().uuid(),
  invites: z.array(z.object({
    email: z.string().email(),
    roleId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    isManager: z.boolean().optional(),
    isAdmin: z.boolean().optional(),
  })).min(1),
});

type InviteOut = { email: string; joinUrl: string; emailed: boolean; error?: string };

function baseUrlFrom(req: Request): string {
  return process.env.BASE_URL || BASE_URL || new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = InvitePayload.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    const { businessId, invites } = parsed.data;

    const supabase = createRouteHandlerClient({ cookies });

    // authz
    const [{ data: mgr }, { data: ver }] = await Promise.all([
      supabase.rpc("is_manager", { biz: businessId }),
      supabase.rpc("is_verified", { biz: businessId }),
    ]);
    if (!mgr) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (!ver) return NextResponse.json({ error: "Business not verified" }, { status: 403 });

    // inviter
    const { data: userData } = await supabase.auth.getUser();
    const inviterId = userData?.user?.id ?? null;

    // insert invites; token generated in DB with DEFAULT gen_random_uuid()
    const { data: inserted, error: insertErr } = await supabase
      .from("employee_invite")
      .insert(invites.map(i => ({
        business_id: businessId,
        email: i.email,
        role_id: i.roleId ?? null,
        location_id: i.locationId ?? null,
        is_manager: !!i.isManager,
        is_admin: !!i.isAdmin,
        invited_by: inviterId,
        status: "pending",
      })))
      .select("email, token");

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

    const siteUrl = baseUrlFrom(req);
    const joinPath = process.env.JOIN_PATH || "/signup";

    const out: InviteOut[] = [];
    for (const row of inserted ?? []) {
      const joinUrl = `${siteUrl}${joinPath}?token=${row.token}`;
      const result = await sendInviteEmail(row.email, joinUrl);
      out.push({
        email: row.email,
        joinUrl,
        emailed: result.ok,
        error: result.ok ? undefined : result.error,
      });
    }

    return NextResponse.json({ invites: out }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

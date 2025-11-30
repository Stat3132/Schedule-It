import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[employment/terminate] Missing Supabase admin environment variables");
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function banUser(userId: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase admin env vars not configured");
  }

  const resp = await fetch(`${SUPABASE_URL}/admin/v1/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ banned: true }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || "Failed to disable user");
  }
}

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client unavailable" }, { status: 500 });
  }

  const payload = (await req.json().catch(() => null)) as {
    employmentId?: string;
    userId?: string;
    businessId?: string;
    reason?: string | null;
  } | null;

  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { employmentId, userId, businessId } = payload;

  if (!employmentId || !userId || !businessId) {
    return NextResponse.json({ error: "employmentId, userId, and businessId are required" }, { status: 400 });
  }

  const { data: employmentRow, error: employmentErr } = await supabaseAdmin
    .from("employment")
    .select("id,business_id,status,terminated_at")
    .eq("id", employmentId)
    .limit(1)
    .single();

  if (employmentErr) {
    return NextResponse.json({ error: employmentErr.message }, { status: 400 });
  }

  if (!employmentRow || employmentRow.business_id !== businessId) {
    return NextResponse.json({ error: "Employment record not found for this business" }, { status: 404 });
  }

  const terminatedAt = new Date().toISOString();

  const { error: updateErr } = await supabaseAdmin
    .from("employment")
    .update({ status: "terminated", terminated_at: terminatedAt })
    .eq("id", employmentId)
    .eq("business_id", businessId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  try {
    await banUser(userId);
  } catch (banErr) {
    const message = banErr instanceof Error ? banErr.message : "Failed to disable auth user";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ terminated_at: terminatedAt });
}

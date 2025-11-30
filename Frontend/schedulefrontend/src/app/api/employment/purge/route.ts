import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[employment/purge] Missing Supabase admin environment variables");
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const PURGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client unavailable" }, { status: 500 });
  }

  if (CRON_SECRET) {
    const headerSecret = req.headers.get("x-cron-key");
    if (headerSecret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const threshold = new Date(Date.now() - PURGE_WINDOW_MS).toISOString();

  const { data: expiredRows, error: fetchErr } = await supabaseAdmin
    .from("employment")
    .select("id")
    .eq("status", "terminated")
    .lte("terminated_at", threshold);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }

  const ids = (expiredRows ?? []).map(row => row.id);

  if (!ids.length) {
    return NextResponse.json({ purged: 0 });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from("employment")
    .delete()
    .in("id", ids);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 400 });
  }

  return NextResponse.json({ purged: ids.length });
}

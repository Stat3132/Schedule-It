// app/api/check-email/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Use the public Supabase URL env var (Next.js public env) and a server-only
// service role key. Vercel deploys typically provide `NEXT_PUBLIC_SUPABASE_URL`.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

if (!supabaseAdmin) {
  console.error("Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

// Note: We use the Supabase Admin REST endpoint directly below. The
// SDK-based `supabaseAdmin` client was removed because the REST call is
// more explicit and avoids SDK compatibility issues in different versions.

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rawEmail = (body.email as string | undefined) ?? undefined;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "Email is required", exists: false },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();

    console.log("[check-email] checking:", email);

    // Fallback to the Supabase Admin REST endpoint to check users by email.
    // This uses the service role key and does not rely on SDK admin method names,
    // which can vary between versions.
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server misconfigured", exists: false }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (error && error.message && !/user not found/i.test(error.message)) {
      console.error("[check-email] admin sdk error:", error);
      return NextResponse.json({ error: "Failed to check email", exists: false }, { status: 500 });
    }

    const exists = Boolean(data?.user);
    console.log("[check-email] exists=", exists);
    return NextResponse.json({ exists });
  } catch (err) {
    console.error("[check-email] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error", exists: false },
      { status: 500 }
    );
  }
}

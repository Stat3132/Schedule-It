// app/api/check-email/route.ts
import { NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Use the public Supabase URL env var (Next.js public env) and a server-only
// service role key. Vercel deploys typically provide `NEXT_PUBLIC_SUPABASE_URL`.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

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

    // Call Supabase Admin REST endpoint directly to avoid SDK differences.
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server misconfigured", exists: false }, { status: 500 });
    }

    const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
    const response = await fetch(adminUrl, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: "no-store",
    });

    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      console.error("[check-email] admin fetch error:", response.status, details);
      return NextResponse.json({ error: "Failed to check email", exists: false }, { status: 500 });
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch (jsonErr) {
      if (response.status !== 404) {
        console.error("[check-email] failed to parse admin response", jsonErr);
      }
    }

    let user: unknown = null;
    if (Array.isArray(payload)) {
      user = payload[0];
    } else if (payload && typeof payload === "object") {
      const maybeUsers = (payload as { users?: unknown }).users;
      if (Array.isArray(maybeUsers)) {
        user = maybeUsers[0];
      } else {
        user = payload;
      }
    }

    const exists = Boolean(user && typeof user === "object" && (user as { id?: string }).id);
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

// app/api/check-email/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use server-only env vars in Next.js route handlers. `NEXT_PUBLIC_*` keys
// are meant for the browser and may not be present for server usage.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Throwing here will cause Next.js to return a 500 and the server log
  // will include this message — helpful during local development.
  console.error("Missing Supabase server env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(SUPABASE_URL || "", SUPABASE_SERVICE_ROLE_KEY || "", {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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
    const adminUrl = `${SUPABASE_URL}/admin/v1/users?email=${encodeURIComponent(
      email
    )}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY || "",
      Accept: "application/json",
    };

    const adminResp = await fetch(adminUrl, { headers });

    if (!adminResp.ok) {
      const text = await adminResp.text().catch(() => "");
      console.error("[check-email] admin endpoint error:", adminResp.status, text);
      return NextResponse.json({ error: "Failed to check email", exists: false }, { status: 500 });
    }

    const usersRaw = (await adminResp.json().catch(() => null)) as unknown;
    const users = Array.isArray(usersRaw) ? (usersRaw as Array<Record<string, unknown>>) : null;
    console.log("[check-email] admin users result count:", users?.length ?? null);

    const exists = Array.isArray(users) && users.length > 0;
    return NextResponse.json({ exists });
  } catch (err) {
    console.error("[check-email] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error", exists: false },
      { status: 500 }
    );
  }
}

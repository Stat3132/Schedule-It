// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

/* ========= Supabase Client ========= */

// Try Next.js-style public env vars first, then fall back to Vite-style `import.meta.env` if available.
function readSupabaseEnv() {
  // Next.js public env vars (recommended for this Next.js app)
  const fromProcess =
    typeof process !== "undefined" && process.env
      ? {
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        }
      : null;

  if (fromProcess && fromProcess.supabaseUrl && fromProcess.supabaseAnonKey) {
    return fromProcess;
  }

  // Fallback for environments that provide `import.meta.env` (e.g., Vite)
  if (typeof window !== "undefined") {
    const im = import.meta as unknown as { env?: Record<string, unknown> };
    const env = im.env ?? {};
    const supabaseUrl = typeof env.VITE_SUPABASE_URL === "string" ? env.VITE_SUPABASE_URL : undefined;
    const supabaseAnonKey = typeof env.VITE_SUPABASE_ANON_KEY === "string" ? env.VITE_SUPABASE_ANON_KEY : undefined;
    if (supabaseUrl && supabaseAnonKey) {
      return { supabaseUrl, supabaseAnonKey } as { supabaseUrl?: string; supabaseAnonKey?: string };
    }
  }

  return { supabaseUrl: undefined, supabaseAnonKey: undefined } as { supabaseUrl?: string; supabaseAnonKey?: string };
}

const { supabaseUrl, supabaseAnonKey } = readSupabaseEnv();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment or provide VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ========= Shared Types ========= */

export interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  target_role_ids?: string[] | null; 
}

/* ========= Availability Types ========= */

export type AvailabilityStatus = "available" | "partial" | "unavailable";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface CurrentAvailability {
  id: string;
  user_id: string;
  day_of_week: DayOfWeek;
  availability_status: AvailabilityStatus;
  updated_at: string;
}

export interface AvailabilityRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface AvailabilityDay {
  id: string;
  request_id: string;
  day_of_week: DayOfWeek;
  availability_status: AvailabilityStatus;
  created_at: string;
}

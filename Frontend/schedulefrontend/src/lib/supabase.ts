// lib/supabase.ts
// Shared types only – no Supabase client here.

/* ========= Availability Types ========= */

export type AvailabilityStatus =
  | "available"
  | "partial"
  | "unavailable";

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

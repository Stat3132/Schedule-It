// app/employeemanagement/employeehomepage/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Calendar, Clock, Bell, Settings, LogOut, AlertCircle } from "lucide-react";

// ---- Types ----
type Employment = {
  id: string;
  user_id: string;
  business_id: string;
  location_id: string | null;
  role_id: string | null;
  status: "invited" | "active" | "inactive" | "terminated";
  is_manager: boolean;
  is_admin: boolean;
};

type ShiftRow = {
  id: string;
  business_id: string;
  location_id: string;
  role_id: string;
  start_ts: string; // ISO
  end_ts: string; // ISO
  status: "draft" | "published" | "canceled";
};

type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  user_id: string;
  assigned_by: string | null;
  assigned_at: string;
  status: "assigned" | "offered" | "accepted" | "declined" | "dropped";
  source: "manager" | "autofill" | "swap";
  drop_reason?: string | null;
  responded_at?: string | null;
};

type RoleRow = { id: string; name: string; color: string | null };
type LocationRow = { id: string; name: string };

type ShiftWithMeta = {
  shift: ShiftRow;
  role?: RoleRow | null;
  location?: LocationRow | null;
};

type ShiftTemplateRow = {
  id: string;
  business_id: string;
  role_id: string;
  location_id: string;
  weekday: number; // 0=Sun
  start_time: string; // "HH:MM:SS"
  end_time: string; // "HH:MM:SS"
};

type TORowLite = {
  start_ts: string;
  end_ts: string;
  status: "pending" | "approved";
};

type AvailabilityStatus = "available" | "partial" | "unavailable";
type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type WeeklyPattern = Record<DayOfWeek, AvailabilityStatus>;

type AvailabilityRowLite = {
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status?: string | null;
};

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_KEYS: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type BucketShift = {
  shiftId?: string;
  assignmentId?: string | null;
  role: string;
  start: string;
  end: string;
  color?: string | null;
  locationName?: string | null;
  isDropPending?: boolean;
  isPickedUp?: boolean;
};

type DayBucket = {
  dayIndex: number;
  date: Date;
  shifts: BucketShift[];
};

type DayFlags = {
  hasTimeOff: boolean;
  timeOffStatus?: "pending" | "approved";
  isUnavailableByAvailability: boolean;
};

type DroppedShift = {
  assignmentId: string;
  shiftId: string;
  date: Date;
  weekdayIndex: number;
  role: string;
  locationName: string | null;
  start: string;
  end: string;
  status: "dropped";
};

type Coworker = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
};

type SelectedShift = {
  shiftId: string;
  assignmentId: string | null;
  date: Date;
  weekdayIndex: number;
  role: string;
  locationName: string | null;
  start: string;
  end: string;
};

// ---- Helpers ----
function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 0): Date {
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(d.getDate() - diff);
  return out;
}

function endOfWeek(d: Date, weekStartsOn: 0 | 1 = 0): Date {
  const start = startOfWeek(d, weekStartsOn);
  const out = new Date(start);
  out.setDate(start.getDate() + 7);
  out.setMilliseconds(-1);
  return out;
}

function fmtDateMMDD(d: Date): string {
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${mm}/${dd}`;
}

function fmtTimeLocal(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function normalizeToLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function normalizePattern(raw: unknown): WeeklyPattern {
  const ALL_DAYS: DayOfWeek[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  let src: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.pattern && typeof r.pattern === "object" && r.pattern !== null) {
      src = r.pattern as Record<string, unknown>;
    } else {
      src = r;
    }
  }

  const out: Partial<WeeklyPattern> = {};
  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v as AvailabilityStatus;
    } else {
      out[day] = "available";
    }
  }
  return out as WeeklyPattern;
}

// ---- Component ----
export default function EmployeeHomePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employmentState, setEmploymentState] = useState<Employment | null>(
    null,
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [weekLabel, setWeekLabel] = useState<string>("");
  const [days, setDays] = useState<DayBucket[]>([]);
  const [hadRealAssignments, setHadRealAssignments] = useState<boolean>(false);
  const [dayFlags, setDayFlags] = useState<Record<number, DayFlags>>({});
  const [droppedShifts, setDroppedShifts] = useState<DroppedShift[]>([]);

  const [selectedShift, setSelectedShift] = useState<SelectedShift | null>(
    null,
  );
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [coworkersLoading, setCoworkersLoading] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [dropSubmitting, setDropSubmitting] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1) Auth
      const { data: auth } = await supabase.auth.getUser();
      const uid: string | undefined = auth.user?.id;
      setCurrentUserId(uid ?? null);
      if (!uid) {
        if (!cancelled) {
          setDays(defaultEmptyWeek());
          setWeekLabel(labelForWeek(new Date()));
          setHadRealAssignments(false);
          setDayFlags({});
          setDroppedShifts([]);
          setLoading(false);
        }
        return;
      }

      // 2) Active employment
      const { data: emps, error: empErr } = await supabase
        .from("employment")
        .select(
          "id,user_id,business_id,location_id,role_id,status,is_manager,is_admin",
        )
        .eq("user_id", uid)
        .eq("status", "active");

      if (empErr || !emps || emps.length === 0) {
        if (!cancelled) {
          setDays(defaultEmptyWeek());
          setWeekLabel(labelForWeek(new Date()));
          setHadRealAssignments(false);
          setDayFlags({});
          setDroppedShifts([]);
          setLoading(false);
        }
        return;
      }
      const employment: Employment = emps[0];
      setEmploymentState(employment);

      // 3) Week window
      const now = new Date();
      const weekStart = startOfWeek(now, 0);
      const weekEnd = endOfWeek(now, 0);
      const label = labelForWeek(now);

      // Initialize per-day flags for this week (0..6)
      const flagsByIndex: Record<number, DayFlags> = {};
      for (let i = 0; i < 7; i++) {
        flagsByIndex[i] = {
          hasTimeOff: false,
          isUnavailableByAvailability: false,
        };
      }

      const todayISODate = now.toISOString().split("T")[0];

      // 3a) Availability for this user, effective today
      try {
        const { data: availRows, error: availErr } = await supabase
          .from("availability")
          .select(
            "weekly_pattern_json,effective_from,effective_to,status",
          )
          .eq("user_id", uid)
          .lte("effective_from", todayISODate)
          .or(`effective_to.is.null,effective_to.gte.${todayISODate}`)
          .order("effective_from", { ascending: false });

        if (!availErr && availRows && availRows.length > 0) {
          const rows = availRows as AvailabilityRowLite[];
          const current =
            rows.find((r) => r.status === "approved") ?? rows[0];

          const pattern = normalizePattern(current.weekly_pattern_json);

          for (let i = 0; i < 7; i++) {
            const key = DAY_KEYS[i];
            const statusForDay = pattern[key];
            if (statusForDay === "unavailable") {
              flagsByIndex[i].isUnavailableByAvailability = true;
            }
          }
        }
      } catch (e) {
        console.error("[EmployeeHome] availability load error", e);
      }

      // 3b) Time off requests for this user that intersect this week (pending/approved)
      try {
        const { data: torRows, error: torErr } = await supabase
          .from("time_off_request")
          .select("start_ts,end_ts,status")
          .eq("user_id", uid)
          .in("status", ["pending", "approved"]);

        if (!torErr && torRows && torRows.length > 0) {
          const rows = torRows as TORowLite[];

          for (const r of rows) {
            const startRaw = new Date(r.start_ts);
            const endRaw = new Date(r.end_ts); // exclusive
            const lastIncluded = new Date(endRaw.getTime() - 1);

            let cur = normalizeToLocalDay(startRaw);
            const lastDay = normalizeToLocalDay(lastIncluded);

            while (cur <= lastDay) {
              const curMs = cur.getTime();
              if (
                curMs >= normalizeToLocalDay(weekStart).getTime() &&
                curMs <= normalizeToLocalDay(weekEnd).getTime()
              ) {
                const idx = cur.getDay(); // 0..6
                const existing = flagsByIndex[idx];

                if (!existing.hasTimeOff) {
                  flagsByIndex[idx].hasTimeOff = true;
                  flagsByIndex[idx].timeOffStatus = r.status;
                } else if (
                  existing.timeOffStatus === "pending" &&
                  r.status === "approved"
                ) {
                  flagsByIndex[idx].timeOffStatus = "approved";
                }
              }

              cur = new Date(cur);
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
      } catch (e) {
        console.error("[EmployeeHome] time off load error", e);
      }

      // 4) Assignments for user → shift_ids (all statuses)
      const { data: saRows, error: saErr } = await supabase
        .from("shift_assignment")
        .select(
          "id,shift_id,user_id,assigned_by,assigned_at,status,source,drop_reason,responded_at",
        )
        .eq("user_id", uid);

      if (!saErr && saRows && saRows.length > 0) {
        const assignments = saRows as ShiftAssignmentRow[];

        // All shift ids for this user (any status)
        const shiftIds: string[] = Array.from(
          new Set(assignments.map((r) => r.shift_id)),
        );

        // 5) Shifts in this week (published, exclude canceled)
        const { data: shifts, error: shErr } = await supabase
          .from("shift")
          .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
          .in("id", shiftIds)
          .neq("status", "canceled")
          .gte("start_ts", weekStart.toISOString())
          .lte("start_ts", weekEnd.toISOString());

        if (!shErr && shifts && shifts.length > 0) {
          const shiftRows = shifts as ShiftRow[];

          const roleIds = Array.from(new Set(shiftRows.map((s) => s.role_id)));
          const locIds = Array.from(new Set(shiftRows.map((s) => s.location_id)));

          const [{ data: roles }, { data: locs }] = await Promise.all([
            roleIds.length
              ? supabase.from("role").select("id,name,color").in("id", roleIds)
              : Promise.resolve({ data: null }),
            locIds.length
              ? supabase.from("location").select("id,name").in("id", locIds)
              : Promise.resolve({ data: null }),
          ]);

          const roleById: Record<string, RoleRow> = {};
          if (roles)
            for (const r of roles as RoleRow[]) roleById[r.id] = r;

          const locById: Record<string, LocationRow> = {};
          if (locs)
            for (const l of locs as LocationRow[]) locById[l.id] = l;

          // Map shift_id → assignment (for this user)
          const assignmentByShiftId: Record<string, ShiftAssignmentRow> = {};
          for (const a of assignments) {
            assignmentByShiftId[a.shift_id] = a;
          }

          const activeShiftRows: ShiftRow[] = [];
          const dropped: DroppedShift[] = [];

          for (const s of shiftRows) {
            const a = assignmentByShiftId[s.id];
            if (!a) continue;

            const shiftDate = new Date(s.start_ts);
            const weekdayIndex = shiftDate.getDay();
            const role = roleById[s.role_id]?.name ?? "Shift";
            const color = roleById[s.role_id]?.color ?? null;
            const locationName = locById[s.location_id]?.name ?? null;

            if (a.status === "dropped") {
              dropped.push({
                assignmentId: a.id,
                shiftId: s.id,
                date: shiftDate,
                weekdayIndex,
                role,
                locationName,
                start: fmtTimeLocal(s.start_ts),
                end: fmtTimeLocal(s.end_ts),
                status: "dropped",
              });
              activeShiftRows.push(s);
            } else if (a.status !== "declined") {
              activeShiftRows.push(s);
            }
          }

          // Build schedule buckets from active shifts only
          const withMeta: ShiftWithMeta[] = activeShiftRows.map((s) => ({
            shift: s,
            role: roleById[s.role_id] ?? null,
            location: locById[s.location_id] ?? null,
          }));

          const buckets = buildBucketsFromShifts(withMeta, assignmentByShiftId);

          // Sort dropped shifts by date/time
          dropped.sort((a, b) => {
            if (a.date.getTime() !== b.date.getTime()) {
              return a.date.getTime() - b.date.getTime();
            }
            return a.start.localeCompare(b.start);
          });

          if (!cancelled) {
            setDays(buckets);
            setWeekLabel(label);
            setHadRealAssignments(activeShiftRows.length > 0);
            setDayFlags(flagsByIndex);
            setDroppedShifts(dropped);
            setLoading(false);
          }
          return;
        }
      }

      // 6) Fallback: templates
      let bucketsFromTemplates: DayBucket[] | null = null;
      const { data: templates, error: stErr } = await supabase
        .from("shift_template")
        .select(
          "id,business_id,role_id,location_id,weekday,start_time,end_time",
        )
        .eq("business_id", employment.business_id);

      if (!stErr && templates && templates.length > 0) {
        const filtered = templates.filter((t: ShiftTemplateRow) => {
          const roleOk = employment.role_id
            ? t.role_id === employment.role_id
            : true;
          const locOk = employment.location_id
            ? t.location_id === employment.location_id
            : true;
          return roleOk && locOk;
        });
        if (filtered.length > 0)
          bucketsFromTemplates = buildBucketsFromTemplates(
            filtered,
            weekStart,
          );
      }

      if (!cancelled) {
        if (bucketsFromTemplates) {
          setDays(bucketsFromTemplates);
          setWeekLabel(label + " • typical week");
        } else {
          setDays(defaultEmptyWeek());
          setWeekLabel(label);
        }
        setHadRealAssignments(false);
        setDayFlags(flagsByIndex);
        setDroppedShifts([]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, refreshKey]);

  const todayIdx = new Date().getDay();
  const todayFlags = dayFlags[todayIdx];

  // Load coworkers for the selected shift's day
  const loadCoworkersForDay = async (date: Date) => {
    if (!employmentState) return;
    setCoworkers([]);
    setCoworkersLoading(true);
    try {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const { data: dayShifts, error: dayShErr } = await supabase
        .from("shift")
        .select("id")
        .eq("business_id", employmentState.business_id)
        .neq("status", "canceled")
        .gte("start_ts", dayStart.toISOString())
        .lt("start_ts", dayEnd.toISOString());

      if (dayShErr || !dayShifts || dayShifts.length === 0) {
        setCoworkers([]);
        setCoworkersLoading(false);
        return;
      }

      const dayShiftIds = (dayShifts as { id: string }[]).map((d) => d.id);

      const { data: dayAssignments, error: daErr } = await supabase
        .from("shift_assignment")
        .select("user_id")
        .in("shift_id", dayShiftIds)
        .in("status", ["assigned", "accepted", "offered", "dropped"]);

      if (daErr || !dayAssignments || dayAssignments.length === 0) {
        setCoworkers([]);
        setCoworkersLoading(false);
        return;
      }

      const userIds = Array.from(
        new Set(
          (dayAssignments as { user_id: string }[]).map((a) => a.user_id),
        ),
      );

      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", userIds);

      if (profErr || !profs) {
        setCoworkers([]);
        setCoworkersLoading(false);
        return;
      }

      const profList = (profs ?? []) as ProfileRow[];
      const mapped: Coworker[] = profList.map((p) => ({
        id: p.id,
        name: p.full_name || p.display_name || p.email || "Unnamed",
      }));

      setCoworkers(mapped);
    } catch (e) {
      console.error("[EmployeeHome] load coworkers error", e);
      setCoworkers([]);
    } finally {
      setCoworkersLoading(false);
    }
  };

  const handleShiftClick = async (bucket: DayBucket, s: BucketShift) => {
    if (!s.shiftId || s.isDropPending) return; // ignore templates and already-dropped
    setDropReason("");
    setDropError(null);

    const sel: SelectedShift = {
      shiftId: s.shiftId,
      assignmentId: s.assignmentId ?? null,
      date: bucket.date,
      weekdayIndex: bucket.dayIndex,
      role: s.role,
      locationName: s.locationName ?? null,
      start: s.start,
      end: s.end,
    };

    setSelectedShift(sel);
    await loadCoworkersForDay(bucket.date);
  };

  const handleConfirmDrop = async () => {
    if (!selectedShift || !selectedShift.assignmentId || !currentUserId) return;

    const reason = dropReason.trim();
    if (!reason) {
      setDropError("Please provide a reason for dropping this shift.");
      return;
    }

    setDropSubmitting(true);
    setDropError(null);
    try {
      const { error } = await supabase
        .from("shift_assignment")
        .update({
          status: "dropped",
          drop_reason: reason,
          responded_at: new Date().toISOString(),
        })
        .eq("id", selectedShift.assignmentId)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("[EmployeeHome] drop shift error", error);
        setDropError("Unable to drop this shift. Please try again.");
        setDropSubmitting(false);
        return;
      }

      setSelectedShift(null);
      setDropReason("");
      setDropError(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      console.error("[EmployeeHome] drop shift exception", e);
      setDropError("Something went wrong. Please try again.");
    } finally {
      setDropSubmitting(false);
    }
  };

  // ---- Render ----
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Your Schedule</h1>
          <p className="text-gray-600 mt-1">
            {loading ? "Loading…" : weekLabel}
            {!loading && !hadRealAssignments ? " • no assigned shifts" : ""}
          </p>

          {/* Today banner for time off / availability */}
          {!loading &&
            todayFlags &&
            (todayFlags.hasTimeOff || todayFlags.isUnavailableByAvailability) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {todayFlags.hasTimeOff && (
                  <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    You have{" "}
                    {todayFlags.timeOffStatus === "approved"
                      ? "approved time off"
                      : "a time off request"}{" "}
                    today.
                  </div>
                )}
                {todayFlags.isUnavailableByAvailability && (
                  <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-800">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    You are marked unavailable today in your availability.
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Weekly schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {days.map((bucket: DayBucket) => {
              const flags = dayFlags[bucket.dayIndex];

              return (
                <div
                  key={bucket.dayIndex}
                  className="bg-white p-4 min-h-[200px] flex flex-col"
                >
                  <div className="text-center mb-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {WEEKDAY_LABELS[bucket.dayIndex]}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {fmtDateMMDD(bucket.date)}
                    </div>
                  </div>

                  {/* Day-level badges */}
                  {flags &&
                    (flags.hasTimeOff || flags.isUnavailableByAvailability) && (
                      <div className="mb-3 space-y-1">
                        {flags.hasTimeOff && (
                          <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                            Time off{" "}
                            {flags.timeOffStatus === "approved"
                              ? "(approved)"
                              : "(requested)"}
                          </div>
                        )}
                        {flags.isUnavailableByAvailability && (
                          <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-800">
                            Unavailable (availability)
                          </div>
                        )}
                      </div>
                    )}

                  <div className="space-y-2 flex-1">
                    {bucket.shifts.length > 0 ? (
                      bucket.shifts.map((s, i) => (
                        <button
                          key={`${bucket.dayIndex}-${i}`}
                          type="button"
                          onClick={() => handleShiftClick(bucket, s)}
                          className="w-full text-left bg-teal-50 border border-teal-200 rounded-lg p-3 cursor-pointer hover:bg-teal-100 transition-colors disabled:cursor-default disabled:opacity-80"
                          style={s.color ? { borderColor: s.color } : undefined}
                          disabled={!s.shiftId || s.isDropPending}
                        >
                          <div className="text-xs font-semibold text-teal-900 mb-1 flex justify-between gap-2">
                            <span>
                              {s.role}
                              {s.locationName ? ` · ${s.locationName}` : ""}
                            </span>
                            <span className="flex gap-1">
                              {s.isPickedUp && (
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                                  Picked up
                                </span>
                              )}
                              {s.isDropPending && (
                                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                  Drop requested
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-teal-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {s.start} - {s.end}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        <div className="text-xs text-gray-400">
                          {flags?.hasTimeOff
                            ? flags.timeOffStatus === "approved"
                              ? "Time off (approved)"
                              : "Time off requested"
                            : flags?.isUnavailableByAvailability
                            ? "Unavailable"
                            : "Off"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dropped shifts */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">Dropped shifts</h2>
          <p className="text-sm text-gray-600 mt-1">
            Shifts you have requested to drop for this week. These remain on your schedule until a manager approves the change.
          </p>

          <div className="mt-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {droppedShifts.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                You have no dropped shifts for this week.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {droppedShifts.map((ds) => (
                  <li
                    key={ds.assignmentId}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {WEEKDAY_LABELS[ds.weekdayIndex]} · {fmtDateMMDD(ds.date)}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {ds.locationName && (
                          <>
                            {ds.locationName}
                            {" · "}
                          </>
                        )}
                        {ds.role} · {ds.start} - {ds.end}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                      Pending manager review
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* Drop shift modal */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedShift.role}
                  {selectedShift.locationName
                    ? ` · ${selectedShift.locationName}`
                    : ""}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {WEEKDAY_LABELS[selectedShift.weekdayIndex]} ·{" "}
                  {fmtDateMMDD(selectedShift.date)} · {selectedShift.start} –{" "}
                  {selectedShift.end}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">
                Coworkers that day
              </h3>
              {coworkersLoading ? (
                <p className="mt-1 text-sm text-gray-500">Loading…</p>
              ) : coworkers.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">
                  No other coworkers found for this day yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-sm text-gray-700">
                  {coworkers.map((c) => (
                    <li key={c.id}>
                      {c.name}
                      {c.id === currentUserId ? " (you)" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Reason for dropping this shift
              </label>
              <textarea
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="Explain why you need to drop this shift..."
              />
              {dropError && (
                <p className="mt-1 text-sm text-red-600">{dropError}</p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={dropSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDrop}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60"
                disabled={dropSubmitting}
              >
                {dropSubmitting ? "Dropping…" : "Drop this shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Builders ----
function defaultEmptyWeek(): DayBucket[] {
  const now = new Date();
  const start = startOfWeek(now, 0);
  return Array.from({ length: 7 }, (_: unknown, i: number) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { dayIndex: i, date: d, shifts: [] };
  });
}

function labelForWeek(reference: Date): string {
  const start = startOfWeek(reference, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = start.toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `Week of ${startLabel} - ${endLabel}`;
}

function buildBucketsFromShifts(
  rows: ShiftWithMeta[],
  assignmentByShiftId: Record<string, ShiftAssignmentRow>,
): DayBucket[] {
  const buckets = defaultEmptyWeek();
  for (const r of rows) {
    const s = new Date(r.shift.start_ts);
    const idx = s.getDay();
    const roleName = r.role?.name ?? "Shift";
    const color = r.role?.color ?? null;
    const locationName = r.location?.name ?? null;
    const assignment = assignmentByShiftId[r.shift.id];

    buckets[idx].shifts.push({
      shiftId: r.shift.id,
      assignmentId: assignment?.id ?? null,
      role: roleName,
      start: fmtTimeLocal(r.shift.start_ts),
      end: fmtTimeLocal(r.shift.end_ts),
      color,
      locationName,
      isDropPending: assignment?.status === "dropped",
      isPickedUp: assignment?.source === "swap",
    });
  }
  for (const b of buckets) {
    b.shifts.sort((a, b2) => a.start.localeCompare(b2.start));
  }
  return buckets;
}

function buildBucketsFromTemplates(
  templates: ShiftTemplateRow[],
  weekStart: Date,
): DayBucket[] {
  const buckets = defaultEmptyWeek();
  for (const t of templates) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + t.weekday);
    const [sh, sm] = t.start_time.split(":").map((n) => parseInt(n, 10));
    const [eh, em] = t.end_time.split(":").map((n) => parseInt(n, 10));
    const s = new Date(dayDate);
    s.setHours(
      Number.isFinite(sh) ? sh : 0,
      Number.isFinite(sm) ? sm : 0,
      0,
      0,
    );
    const e = new Date(dayDate);
    e.setHours(
      Number.isFinite(eh) ? eh : 0,
      Number.isFinite(em) ? em : 0,
      0,
      0,
    );
    buckets[t.weekday].shifts.push({
      role: "Typical shift",
      start: s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      end: e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      color: null,
      locationName: null,
    });
  }
  for (const b of buckets) {
    b.shifts.sort((a, b2) => a.start.localeCompare(b2.start));
  }
  return buckets;
}

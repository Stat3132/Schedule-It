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

// NOTE: For this page we only ever query "pending" + "approved"
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

type DayBucket = {
  dayIndex: number;
  date: Date;
  shifts: Array<{
    role: string;
    start: string;
    end: string;
    color?: string | null;
  }>;
};

type DayFlags = {
  hasTimeOff: boolean;
  timeOffStatus?: "pending" | "approved";
  isUnavailableByAvailability: boolean;
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

  const [loading, setLoading] = useState<boolean>(true);
  const [weekLabel, setWeekLabel] = useState<string>("");
  const [days, setDays] = useState<DayBucket[]>([]);
  const [hadRealAssignments, setHadRealAssignments] = useState<boolean>(false);
  const [dayFlags, setDayFlags] = useState<Record<number, DayFlags>>({});

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
      console.debug("[EmployeeHome] auth user", uid);
      if (!uid) {
        if (!cancelled) {
          setDays(defaultEmptyWeek());
          setWeekLabel(labelForWeek(new Date()));
          setHadRealAssignments(false);
          setDayFlags({});
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

      console.debug("[EmployeeHome] employment", { empErr, emps });

      if (empErr || !emps || emps.length === 0) {
        if (!cancelled) {
          setDays(defaultEmptyWeek());
          setWeekLabel(labelForWeek(new Date()));
          setHadRealAssignments(false);
          setDayFlags({});
          setLoading(false);
        }
        return;
      }
      const employment: Employment = emps[0];

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

      // 4) Assignments for user → shift_ids
      const { data: saRows, error: saErr } = await supabase
        .from("shift_assignment")
        .select("id,shift_id,user_id,assigned_by,assigned_at,status")
        .eq("user_id", uid);

      console.debug("[EmployeeHome] assignments", {
        saErr,
        saCount: saRows?.length,
        saRows,
      });

      if (!saErr && saRows && saRows.length > 0) {
        const shiftIds: string[] = saRows.map(
          (r: ShiftAssignmentRow) => r.shift_id,
        );

        // 5) Shifts in this week (draft + published, exclude canceled)
        const { data: shifts, error: shErr } = await supabase
          .from("shift")
          .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
          .in("id", shiftIds)
          .neq("status", "canceled")
          .gte("start_ts", weekStart.toISOString())
          .lte("start_ts", weekEnd.toISOString());

        console.debug("[EmployeeHome] shifts", {
          shErr,
          shiftCount: shifts?.length,
          sample: shifts?.[0],
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
        });

        if (!shErr && shifts && shifts.length > 0) {
          const roleIds = Array.from(new Set(shifts.map((s) => s.role_id)));
          const locIds = Array.from(new Set(shifts.map((s) => s.location_id)));

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

          const withMeta: ShiftWithMeta[] = (shifts as ShiftRow[]).map(
            (s: ShiftRow) => ({
              shift: s,
              role: roleById[s.role_id] ?? null,
              location: locById[s.location_id] ?? null,
            }),
          );

          const buckets = buildBucketsFromShifts(withMeta);
          if (!cancelled) {
            setDays(buckets);
            setWeekLabel(label);
            setHadRealAssignments(true);
            setDayFlags(flagsByIndex);
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

      console.debug("[EmployeeHome] templates", {
        stErr,
        templateCount: templates?.length,
      });

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
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const todayIdx = new Date().getDay();
  const todayFlags = dayFlags[todayIdx];

  // ---- Render ----
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center" />
            <div className="flex items-center space-x-1">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                onClick={() =>
                  router.push("/employeemanagement/timeoffrequest")
                }
              >
                <Clock className="w-4 h-4" />
                Request Time Off
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                onClick={() =>
                  router.push("/employeemanagement/changeavailability")
                }
              >
                <Calendar className="w-4 h-4" />
                Change Availability
              </button>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Announcements
              </button>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </nav>

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
                        <div
                          key={`${bucket.dayIndex}-${i}`}
                          className="bg-teal-50 border border-teal-200 rounded-lg p-3"
                          style={s.color ? { borderColor: s.color } : undefined}
                        >
                          <div className="text-xs font-semibold text-teal-900 mb-1">
                            {s.role}
                          </div>
                          <div className="text-xs text-teal-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {s.start} - {s.end}
                          </div>
                        </div>
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
      </main>
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
): DayBucket[] {
  const buckets = defaultEmptyWeek();
  for (const r of rows) {
    const s = new Date(r.shift.start_ts);
    const e = new Date(r.shift.end_ts);
    const idx = s.getDay();
    const roleName = r.role?.name ?? "Shift";
    const color = r.role?.color ?? null;
    buckets[idx].shifts.push({
      role: roleName,
      start: fmtTimeLocal(s.toISOString()),
      end: fmtTimeLocal(e.toISOString()),
      color,
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
    });
  }
  for (const b of buckets) {
    b.shifts.sort((a, b2) => a.start.localeCompare(b2.start));
  }
  return buckets;
}

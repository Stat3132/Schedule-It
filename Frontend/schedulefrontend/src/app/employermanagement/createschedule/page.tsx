"use client";

import React, { JSX, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type UUID = string;

type DayOfWeek =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

type AvailabilityStatus = "available" | "partial" | "unavailable";

type DayRange = { start: string | null; end: string | null };

type WeeklyPatternPayload = {
  reason?: string | null;
  pattern?: Partial<Record<DayOfWeek, AvailabilityStatus>>;
  timeRanges?: Partial<
    Record<DayOfWeek, { start?: string | null; end?: string | null }>
  >;
};

type AvailabilityRow = {
  id: UUID;
  user_id: UUID;
  weekly_pattern_json: unknown;
  effective_from: string; // DATE (e.g. "2025-11-05")
  effective_to: string | null; // DATE or null
  status: "pending" | "approved" | "denied" | "canceled";
};

/* ---------- Core types ---------- */

type Employee = {
  id: UUID;
  name: string;
  roleId?: UUID | null;
  roleName?: string;
};

type ShiftDraft = { employeeId: UUID; day: number; start: string; end: string };

type DayMeta = {
  day: number; // 0..6 index in this week (Sun..Sat)
  label: string; // "Sun", "Mon", ...
  uiDate: string; // "11/16"
  ymd: string; // "2025-11-16"
};

type TimeOffRow = {
  id: UUID;
  user_id: UUID;
  start_ts: string;
  end_ts: string;
  status: "pending" | "approved" | "denied" | "canceled";
  reason: string | null;
};

type SupabaseErrorObj =
  | { code?: string; message?: string; details?: string; hint?: string }
  | null;

/** Availability window resolved for a given employee on a specific calendar day */
type AvailabilityWindow = {
  status: AvailabilityStatus;
  start: string | null; // in HH:mm, for partial
  end: string | null; // in HH:mm, for partial
};

type ShiftRowDb = {
  id: string;
  role_id: string;
  start_ts: string;
  end_ts: string;
  status: "draft" | "published" | "canceled";
};

type ShiftAssignmentRow = {
  shift_id: string;
  user_id: string;
};

const ALL_DAY_NAMES: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/* ---------- Date helpers ---------- */
function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(d.getDate() - diff);
  return out;
}

function fmtDateMMDD(d: Date) {
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${mm}/${dd}`;
}

function fmtYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalHM(date: Date) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/* ---------- Time helpers ---------- */

function toMinutes(t: string) {
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const m = Number(mm);
  return h * 60 + m;
}

function fromMinutes(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** HH:mm -> h:mm AM/PM (for display only) */
function formatTime12(t?: string | null): string {
  if (!t) return "";
  const [hhStr, mmStr] = t.split(":");
  const hh = Number(hhStr);
  if (Number.isNaN(hh)) return t;
  const period = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${mmStr} ${period}`;
}

function formatRange12(start: string, end: string): string {
  return `${formatTime12(start)}–${formatTime12(end)}`;
}

/** Intersection of [baseStart, baseEnd] with an optional [extraStart, extraEnd] window. */
function intersectWindow(
  baseStart: string,
  baseEnd: string,
  extraStart: string | null,
  extraEnd: string | null
): { start: string; end: string } | null {
  let min = toMinutes(baseStart);
  let max = toMinutes(baseEnd);

  if (extraStart) min = Math.max(min, toMinutes(extraStart));
  if (extraEnd) max = Math.min(max, toMinutes(extraEnd));

  if (min >= max) return null;
  return { start: fromMinutes(min), end: fromMinutes(max) };
}

/* ---------- Availability JSON helpers ---------- */

function asWeeklyPattern(raw: unknown): WeeklyPatternPayload {
  if (!raw || typeof raw !== "object") return {};
  return raw as WeeklyPatternPayload;
}

function normalizeSchedule(raw: unknown): Record<DayOfWeek, AvailabilityStatus> {
  const src = asWeeklyPattern(raw).pattern ?? {};
  const out: Partial<Record<DayOfWeek, AvailabilityStatus>> = {};

  for (const day of ALL_DAY_NAMES) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v;
    } else {
      out[day] = "available";
    }
  }

  return out as Record<DayOfWeek, AvailabilityStatus>;
}

function normalizeTimeRanges(raw: unknown): Record<DayOfWeek, DayRange> {
  const src = asWeeklyPattern(raw).timeRanges ?? {};
  const out: Partial<Record<DayOfWeek, DayRange>> = {};

  for (const day of ALL_DAY_NAMES) {
    const v = src[day];
    if (v && typeof v === "object") {
      const start =
        typeof (v as any).start === "string" && (v as any).start.trim().length > 0
          ? (v as any).start
          : null;
      const end =
        typeof (v as any).end === "string" && (v as any).end.trim().length > 0
          ? (v as any).end
          : null;
      out[day] = { start, end };
    } else {
      out[day] = { start: null, end: null };
    }
  }

  return out as Record<DayOfWeek, DayRange>;
}

function ymdToDayOfWeek(ymd: string): DayOfWeek {
  const d = new Date(`${ymd}T12:00:00`);
  const idx = d.getDay(); // 0..6
  return ALL_DAY_NAMES[idx];
}

/* ---------- Page ---------- */

export default function CreateSchedulePage(): JSX.Element {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [openHH, setOpenHH] = useState<string>("09:00");
  const [closeHH, setCloseHH] = useState<string>("17:00");

  const [drafts, setDrafts] = useState<ShiftDraft[]>([]);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ employeeId: string; day: number } | null>(
    null
  );
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  // userId -> list of day indexes (0..6) where approved time off applies
  const [timeOffByUser, setTimeOffByUser] = useState<Record<string, number[]>>({});

  // userId -> dayIndex (0..6) -> availability window for that calendar date
  const [availabilityByUser, setAvailabilityByUser] = useState<
    Record<string, Record<number, AvailabilityWindow>>
  >({});

  // persisted schedule status for this week/location
  const [scheduleStatus, setScheduleStatus] = useState<
    "none" | "draft" | "published"
  >("none");

  /* ---------- Week days for *this* week ---------- */
  const DAYS: DayMeta[] = useMemo(() => {
    const now = new Date();
    const ws = startOfWeek(now, 0); // Sunday start
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      return {
        day: i,
        label: d.toLocaleDateString([], { weekday: "short" }),
        uiDate: fmtDateMMDD(d),
        ymd: fmtYMD(d),
      };
    });
  }, []);

  /* ---------- Read context from localStorage ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedBiz = localStorage.getItem("activeBusinessId");
    const storedLocsRaw = localStorage.getItem("activeLocationIds");
    const storedLocs = storedLocsRaw ? (JSON.parse(storedLocsRaw) as string[]) : [];

    if (!storedBiz) {
      setContextError(
        "No active business selected. Go back to the Employer Home page and choose a business/location before creating a schedule."
      );
      setLoading(false);
      return;
    }

    setActiveBusinessId(storedBiz);
    setActiveLocationId(storedLocs[0] ?? null);
  }, []);

  /* ---------- Load user + business + location + employees + time off + availability + existing schedule ---------- */
  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id ?? null;

        if (!uid) {
          if (!cancelled) {
            setUserId(null);
            setContextError("Not signed in.");
          }
          return;
        }
        if (!cancelled) setUserId(uid);

        // Business
        const { data: biz, error: bizErr } = await supabase
          .from("business")
          .select("id,name")
          .eq("id", activeBusinessId)
          .maybeSingle();

        if (bizErr) console.error("business load error", bizErr);
        if (!cancelled) setBusinessName(biz?.name ?? null);

        // Location
        if (activeLocationId) {
          const { data: loc, error: locErr } = await supabase
            .from("location")
            .select("id,name,opens_at,closes_at")
            .eq("id", activeLocationId)
            .maybeSingle();

          if (locErr) console.error("location load error", locErr);

          if (!cancelled) {
            setLocationName(loc?.name ?? null);
            setOpenHH(loc?.opens_at ?? "09:00");
            setCloseHH(loc?.closes_at ?? "17:00");
          }
        } else {
          if (!cancelled) {
            setLocationName(null);
            setOpenHH("09:00");
            setCloseHH("17:00");
          }
        }

        // Employees
        const { data: empRowsRaw, error: empErr } = await supabase
          .from("employment")
          .select("user_id, role_id, status")
          .eq("business_id", activeBusinessId)
          .eq("status", "active");

        console.debug("CreateSchedule employment load", {
          activeBusinessId,
          empErr,
          count: empRowsRaw?.length ?? 0,
          sample: empRowsRaw?.[0] ?? null,
        });

        if (empErr) {
          console.error("employment load error", empErr);
          if (!cancelled) {
            setEmployees([]);
            setTimeOffByUser({});
            setAvailabilityByUser({});
            setScheduleStatus("none");
            setDrafts([]);
          }
          return;
        }

        const empRows =
          (empRowsRaw ?? []) as { user_id: string; role_id?: UUID | null }[];

        const ids = Array.from(new Set(empRows.map((r) => r.user_id)));

        // Profiles for names
        const { data: profsRaw, error: profErr } = ids.length
          ? await supabase
              .from("profiles")
              .select("id,full_name,display_name,email")
              .in("id", ids)
          : { data: [], error: null };

        if (profErr) console.error("profiles load error", profErr);

        const profs =
          (profsRaw ?? []) as {
            id: string;
            full_name?: string | null;
            display_name?: string | null;
            email?: string | null;
          }[];

        const nameBy = new Map<string, string>(
          profs.map((p) => [
            p.id,
            p.full_name || p.display_name || p.email || "Unnamed",
          ])
        );

        const emps: Employee[] = empRows.map((r) => ({
          id: r.user_id,
          name: nameBy.get(r.user_id) ?? "Unnamed",
          roleId: r.role_id ?? null,
          roleName: "—",
        }));

        if (!cancelled) {
          setEmployees(emps.sort((a, b) => a.name.localeCompare(b.name)));
        }

        // If there are no employees, clear context maps (still allow shifts, but unlikely).
        if (!ids.length) {
          if (!cancelled) {
            setTimeOffByUser({});
            setAvailabilityByUser({});
          }
        }

        const weekStartDate = new Date(`${DAYS[0].ymd}T00:00:00`);
        const weekEndDate = new Date(`${DAYS[6].ymd}T23:59:59`);
        const weekStartISO = weekStartDate.toISOString();
        const weekEndISO = weekEndDate.toISOString();

        // ---- Time off for this week (approved only) ----
        if (ids.length) {
          const { data: toRowsRaw, error: toErr } = await supabase
            .from("time_off_request")
            .select("id,user_id,start_ts,end_ts,status,reason")
            .in("user_id", ids)
            .eq("status", "approved")
            .gte("end_ts", weekStartISO)
            .lte("start_ts", weekEndISO);

          if (toErr) {
            console.error("time off load error", toErr);
          }

          const toRows = (toRowsRaw ?? []) as TimeOffRow[];

          const offByUser: Record<string, Set<number>> = {};

          for (const row of toRows) {
            const start = new Date(row.start_ts);
            const end = new Date(row.end_ts);

            for (const d of DAYS) {
              // use midday to avoid timezone midnight edge cases
              const dayMid = new Date(`${d.ymd}T12:00:00`);
              if (dayMid >= start && dayMid <= end) {
                if (!offByUser[row.user_id]) offByUser[row.user_id] = new Set();
                offByUser[row.user_id].add(d.day);
              }
            }
          }

          const plainTimeOff: Record<string, number[]> = {};
          for (const [uid, set] of Object.entries(offByUser)) {
            plainTimeOff[uid] = Array.from(set.values());
          }

          if (!cancelled) {
            console.debug("Time off map for week", plainTimeOff);
            setTimeOffByUser(plainTimeOff);
          }
        } else {
          if (!cancelled) setTimeOffByUser({});
        }

        // ---- Availability (approved patterns) ----
        if (ids.length) {
          const { data: availRowsRaw, error: availErr } = await supabase
            .from("availability")
            .select(
              "id,user_id,weekly_pattern_json,effective_from,effective_to,status"
            )
            .in("user_id", ids)
            .eq("status", "approved");

          if (availErr) {
            console.error("availability load error", availErr);
            if (!cancelled) setAvailabilityByUser({});
          } else {
            const availRows = (availRowsRaw ?? []) as AvailabilityRow[];

            // Build user -> dayIndex -> {window,effectiveFrom} so latest pattern wins
            const internal: Record<
              string,
              Record<number, { window: AvailabilityWindow; effectiveFrom: Date }>
            > = {};

            for (const row of availRows) {
              // Convert DATE strings to actual Date objects (00:00 local)
              const effStart = new Date(`${row.effective_from}T00:00:00`);
              effStart.setHours(0, 0, 0, 0);
              const effEnd =
                row.effective_to != null
                  ? new Date(`${row.effective_to}T23:59:59`)
                  : null;

              const schedule = normalizeSchedule(row.weekly_pattern_json);
              const ranges = normalizeTimeRanges(row.weekly_pattern_json);

              for (const d of DAYS) {
                const dayDate = new Date(`${d.ymd}T12:00:00`);

                // Only apply this availability row if the day falls in its effective window
                if (dayDate < effStart) continue;
                if (effEnd && dayDate > effEnd) continue;

                const dow = ymdToDayOfWeek(d.ymd);
                const status = schedule[dow];
                const range = ranges[dow];

                const win: AvailabilityWindow = {
                  status,
                  start: range.start,
                  end: range.end,
                };

                const userMap = (internal[row.user_id] ||= {});
                const existing = userMap[d.day];
                if (!existing || effStart > existing.effectiveFrom) {
                  userMap[d.day] = { window: win, effectiveFrom: effStart };
                }
              }
            }

            const finalAvail: Record<string, Record<number, AvailabilityWindow>> =
              {};
            for (const [uid, byDayInternal] of Object.entries(internal)) {
              finalAvail[uid] = {};
              for (const [dayIdxStr, entry] of Object.entries(byDayInternal)) {
                const idx = Number(dayIdxStr);
                finalAvail[uid][idx] = entry.window;
              }
            }

            if (!cancelled) {
              console.debug("Availability map for week", finalAvail);
              setAvailabilityByUser(finalAvail);
            }
          }
        } else {
          if (!cancelled) setAvailabilityByUser({});
        }

        // ---- Existing schedule for this week (draft or published) ----
        if (activeLocationId) {
          const { data: shiftRowsRaw, error: shiftErr } = await supabase
            .from("shift")
            .select("id,role_id,start_ts,end_ts,status")
            .eq("business_id", activeBusinessId)
            .eq("location_id", activeLocationId)
            .gte("start_ts", weekStartISO)
            .lte("end_ts", weekEndISO);

          if (shiftErr) {
            console.error("shift load error", shiftErr);
            if (!cancelled) {
              setScheduleStatus("none");
              setDrafts([]);
            }
          } else {
            const shiftRows = (shiftRowsRaw ?? []) as ShiftRowDb[];
            const shiftIds = shiftRows.map((s) => s.id);

            let assignmentRows: ShiftAssignmentRow[] = [];
            if (shiftIds.length) {
              const { data: asRowsRaw, error: asErr } = await supabase
                .from("shift_assignment")
                .select("shift_id,user_id")
                .in("shift_id", shiftIds);

              if (asErr) {
                console.error("shift_assignment load error", asErr);
              } else {
                assignmentRows = (asRowsRaw ?? []) as ShiftAssignmentRow[];
              }
            }

            const assignmentsByShift: Record<string, string[]> = {};
            for (const as of assignmentRows) {
              (assignmentsByShift[as.shift_id] ||= []).push(as.user_id);
            }

            const weekDrafts: ShiftDraft[] = [];
            const statusSet = new Set<"draft" | "published">();

            for (const s of shiftRows) {
              if (s.status === "canceled") continue;
              const users = assignmentsByShift[s.id] ?? [];
              if (!users.length) continue;

              const startDate = new Date(s.start_ts);
              const endDate = new Date(s.end_ts);

              const ymdLocal = fmtYMD(startDate);
              const dayMeta = DAYS.find((d) => d.ymd === ymdLocal);
              if (!dayMeta) continue;

              const employeeId = users[0]; // assume single-assignment per shift
              weekDrafts.push({
                employeeId,
                day: dayMeta.day,
                start: toLocalHM(startDate),
                end: toLocalHM(endDate),
              });

              if (s.status === "draft" || s.status === "published") {
                statusSet.add(s.status);
              }
            }

            let status: "none" | "draft" | "published" = "none";
            if (statusSet.has("published")) status = "published";
            else if (statusSet.has("draft")) status = "draft";

            if (!cancelled) {
              setDrafts(weekDrafts);
              setScheduleStatus(status);
            }
          }
        } else {
          if (!cancelled) {
            setScheduleStatus("none");
            setDrafts([]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, activeLocationId, supabase, DAYS]);

  /* ---------- Helpers ---------- */

  const getDraft = (empId: string, day: number) =>
    drafts.find((d) => d.employeeId === empId && d.day === day);

  const isEmployeeOffOnDay = (empId: string, day: number | null) => {
    if (day == null) return false;
    const arr = timeOffByUser[empId];
    return Array.isArray(arr) && arr.includes(day);
  };

  const getAvailabilityWindow = (
    empId: string,
    day: number | null
  ): AvailabilityWindow | null => {
    if (day == null) return null;
    const byDay = availabilityByUser[empId];
    if (!byDay) return null;
    return byDay[day] ?? null;
  };

  /** Store-hours ∩ availability for a given employee/day, or null if fully blocked. */
  const computeAllowedWindowForDay = (
    empId: string,
    day: number | null
  ): { start: string; end: string } | null => {
    if (day == null) return null;
    if (isEmployeeOffOnDay(empId, day)) return null;

    const avail = getAvailabilityWindow(empId, day);

    if (!avail || avail.status === "available") {
      // No additional restriction beyond store hours
      return { start: openHH, end: closeHH };
    }

    if (avail.status === "unavailable") {
      return null;
    }

    // Partial availability: intersect store hours with the partial window
    const window = intersectWindow(openHH, closeHH, avail.start, avail.end);
    return window;
  };

  function openEditor(empId: string, day: number) {
    const allowed = computeAllowedWindowForDay(empId, day);
    if (!allowed) {
      // Either approved time off or unavailable for that day; do nothing.
      return;
    }

    const existing = getDraft(empId, day);
    if (existing) {
      const clampedExisting =
        intersectWindow(allowed.start, allowed.end, existing.start, existing.end) ??
        allowed;
      setStartTime(clampedExisting.start);
      setEndTime(clampedExisting.end);
    } else {
      setStartTime(allowed.start);
      setEndTime(allowed.end);
    }
    setEditing({ employeeId: empId, day });
  }

  function saveDraftLocal() {
    if (!editing) return;

    const allowed = computeAllowedWindowForDay(editing.employeeId, editing.day);
    if (!allowed) {
      // Safety guard: day is blocked; do not save
      setEditing(null);
      return;
    }

    const chosen =
      intersectWindow(allowed.start, allowed.end, startTime, endTime) ?? allowed;

    setDrafts((prev) => {
      const idx = prev.findIndex(
        (p) => p.employeeId === editing.employeeId && p.day === editing.day
      );
      const next: ShiftDraft = {
        employeeId: editing.employeeId,
        day: editing.day,
        start: chosen.start,
        end: chosen.end,
      };
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = next;
        return copy;
      }
      return [...prev, next];
    });
    setEditing(null);
  }

  function removeDraft(empId: string, day: number) {
    setDrafts((prev) =>
      prev.filter((d) => !(d.employeeId === empId && d.day === day))
    );
  }

  async function persistSchedule(targetStatus: "draft" | "published") {
    if (!activeBusinessId) {
      alert("No business selected (context missing).");
      return;
    }
    if (!userId) {
      alert("Not signed in.");
      return;
    }
    if (!activeLocationId) {
      alert("Please select a location before creating a schedule.");
      return;
    }

    // Filter out drafts that are blocked by time off or availability
    const validDrafts = drafts.filter((d) => {
      const allowed = computeAllowedWindowForDay(d.employeeId, d.day);
      if (!allowed) return false;
      const clamped =
        intersectWindow(allowed.start, allowed.end, d.start, d.end) ?? null;
      return clamped !== null;
    });

    if (validDrafts.length === 0) {
      alert(
        drafts.length === 0
          ? "No shifts to create."
          : "All drafted shifts conflict with approved time off or availability."
      );
      return;
    }

    const missingRole = validDrafts
      .map((d) => ({
        d,
        roleId: employees.find((e) => e.id === d.employeeId)?.roleId,
      }))
      .find((x) => !x.roleId);

    if (missingRole) {
      const emp = employees.find((e) => e.id === missingRole.d.employeeId);
      alert(
        `Employee "${
          emp?.name ?? missingRole.d.employeeId
        }" has no role assigned. Assign a role before creating shifts.`
      );
      return;
    }

    const weekStartDate = new Date(`${DAYS[0].ymd}T00:00:00`);
    const weekEndDate = new Date(`${DAYS[6].ymd}T23:59:59`);
    const weekStartISO = weekStartDate.toISOString();
    const weekEndISO = weekEndDate.toISOString();

    setLoading(true);
    try {
      // Delete existing shifts for this week/location (both draft and published)
      const { data: existingShiftsRaw, error: existingErr } = await supabase
        .from("shift")
        .select("id")
        .eq("business_id", activeBusinessId)
        .eq("location_id", activeLocationId)
        .gte("start_ts", weekStartISO)
        .lte("end_ts", weekEndISO);

      if (existingErr) {
        console.error("existing shift load error", existingErr);
        alert("Could not update existing schedule. See console for details.");
        return;
      }

      const existingShifts = (existingShiftsRaw ?? []) as { id: string }[];
      const existingIds = existingShifts.map((s) => s.id);

      if (existingIds.length) {
        const { error: delAssignErr } = await supabase
          .from("shift_assignment")
          .delete()
          .in("shift_id", existingIds);

        if (delAssignErr) {
          console.error("shift_assignment delete error", delAssignErr);
          alert(
            "Could not clear existing assignments for this week. See console for details."
          );
          return;
        }

        const { error: delShiftErr } = await supabase
          .from("shift")
          .delete()
          .in("id", existingIds);

        if (delShiftErr) {
          console.error("shift delete error", delShiftErr);
          alert("Could not clear existing shifts for this week. See console.");
          return;
        }
      }

      const shifts = validDrafts.map((d) => {
        const dayObj = DAYS.find((x) => x.day === d.day)!;
        const dateStr = dayObj.ymd;
        const startISO = new Date(`${dateStr}T${d.start}:00`).toISOString();
        const endISO = new Date(`${dateStr}T${d.end}:00`).toISOString();
        return {
          business_id: activeBusinessId,
          location_id: activeLocationId,
          role_id: employees.find((e) => e.id === d.employeeId)!.roleId!,
          start_ts: startISO,
          end_ts: endISO,
          status: targetStatus,
          created_by: userId,
          _employeeId: d.employeeId,
        };
      });

      console.debug("Attempting to insert shifts", {
        userId,
        activeBusinessId,
        activeLocationId,
        count: shifts.length,
        status: targetStatus,
        sample: shifts[0],
      });

      const { data: insertedRaw, error: insertErr } = await supabase
        .from("shift")
        .insert(
          shifts.map((s) => ({
            business_id: s.business_id,
            location_id: s.location_id,
            role_id: s.role_id,
            start_ts: s.start_ts,
            end_ts: s.end_ts,
            status: s.status,
            created_by: s.created_by,
          }))
        )
        .select("id,start_ts,end_ts");

      if (insertErr) {
        console.error("shift insert error", insertErr);
        const errObj = insertErr as SupabaseErrorObj;
        const extra =
          errObj?.code === "42501"
            ? " This looks like a row-level security (RLS) denial."
            : "";
        alert(
          `Could not create shifts: ${
            errObj?.message ?? String(insertErr)
          }${errObj?.code ? " (code: " + errObj.code + ")" : ""}${extra}`
        );
        return;
      }

      const inserted = (insertedRaw ?? []) as {
        id: string;
        start_ts: string;
        end_ts: string;
      }[];

      // Create assignments for both draft and published schedules so we can restore the week.
      if (inserted.length) {
        const assignments = inserted.map((row, idx) => ({
          shift_id: row.id,
          user_id: shifts[idx]._employeeId,
          assigned_by: userId!,
          assigned_at: new Date().toISOString(),
          status: "assigned" as const,
          source: "manager" as const,
        }));

        const { error: asErr } = await supabase
          .from("shift_assignment")
          .insert(assignments);
        if (asErr) {
          console.error("assignment error", asErr);
          alert("Shifts created but assignments failed. See console.");
        }
      }

      if (targetStatus === "draft") {
        alert("Draft schedule saved. You can come back to publish it later.");
      } else {
        alert("Schedule published.");
        router.replace("/employermanagement/employerhomepage");
      }

      setScheduleStatus(targetStatus);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Preview data ---------- */

  const previewByDay: Record<
    number,
    { employeeName: string; roleName: string; start: string; end: string }[]
  > = useMemo(() => {
    const map: Record<
      number,
      { employeeName: string; roleName: string; start: string; end: string }[]
    > = {};
    for (const d of drafts) {
      const emp = employees.find((e) => e.id === d.employeeId);
      if (!emp) continue;
      (map[d.day] ||= []).push({
        employeeName: emp.name,
        roleName: emp.roleName ?? "—",
        start: d.start,
        end: d.end,
      });
    }
    for (const dayKey of Object.keys(map)) {
      const day = Number(dayKey);
      map[day].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    }
    return map;
  }, [drafts, employees]);

  if (contextError && !activeBusinessId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Schedule context missing
          </h1>
          <p className="text-sm text-gray-600 mb-4">{contextError}</p>
          <button
            onClick={() =>
              router.replace("/employermanagement/employerhomepage")
            }
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Go to Employer Home
          </button>
        </div>
      </div>
    );
  }

  if (loading && !businessName) {
    return <div className="py-8 text-center">Loading…</div>;
  }

  /* ---------- Render: Employee × Day Grid ---------- */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* top bar */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() =>
              router.replace("/employermanagement/employerhomepage")
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </button>
          <div className="text-xs text-gray-500">
            biz: {activeBusinessId ?? "null"} · loc: {activeLocationId ?? "null"} ·
            emps: {employees.length}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 pb-10">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Create Weekly Schedule
            </h1>
            <p className="text-gray-600 mt-1">
              Use the grid to assign shifts by employee and day. Time off and
              availability are built in.
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">Business: </span>
              {businessName ?? "—"} ·{" "}
              <span className="font-medium">Location: </span>
              {locationName ?? "—"} ·{" "}
              <span className="font-medium">Store hours: </span>
              {formatTime12(openHH)}–{formatTime12(closeHH)}
            </p>
          </div>
          <div className="mt-2 sm:mt-0 text-sm text-gray-600">
            <span className="font-medium mr-1">Current week status:</span>
            <span
              className={
                scheduleStatus === "published"
                  ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200"
                  : scheduleStatus === "draft"
                  ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"
                  : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200"
              }
            >
              {scheduleStatus === "none"
                ? "No saved schedule"
                : scheduleStatus === "draft"
                ? "Draft (manager-only)"
                : "Published"}
            </span>
          </div>
        </div>

        {/* Weekly preview card */}
        {drafts.length > 0 && (
          <div className="mt-4 border border-gray-200 rounded-2xl bg-white shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {scheduleStatus === "draft"
                    ? "Draft schedule preview"
                    : "Schedule preview (this week)"}
                </h2>
                <p className="text-xs text-gray-500">
                  Quick glance at who&apos;s working each day.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              {DAYS.map((d) => {
                const items = previewByDay[d.day] ?? [];
                return (
                  <div
                    key={d.day}
                    className="border border-gray-100 rounded-xl bg-gray-50/60 p-3 min-h-[64px]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-800">
                        {d.label}
                      </span>
                      <span className="text-xs text-gray-500">{d.uiDate}</span>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-[11px] text-gray-400">No shifts</p>
                    ) : (
                      <ul className="space-y-1">
                        {items.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-[11px] text-gray-700 flex flex-col"
                          >
                            <span className="font-medium truncate">
                              {item.employeeName}
                            </span>
                            <span className="truncate text-gray-500">
                              {item.roleName} ·{" "}
                              {formatRange12(item.start, item.end)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Grid controls */}
        <div className="mt-6 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Off / unavailable
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
              Has shift
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
              Click to add / edit
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
            <span>Highlight day:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              {DAYS.map((d) => (
                <button
                  key={d.day}
                  onClick={() => setActiveDay(d.day)}
                  className={`px-2 py-1 text-[11px] font-medium border-l border-gray-200 first:border-l-0 ${
                    activeDay === d.day
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="mt-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Header row */}
            <div className="grid grid-cols-[minmax(220px,0.9fr)_repeat(7,minmax(90px,1fr))] border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700">
              <div className="px-4 py-2 flex items-center justify-between">
                <span>Employee</span>
                <span className="text-[11px] text-gray-400">Role</span>
              </div>
              {DAYS.map((d) => (
                <button
                  key={d.day}
                  onClick={() => setActiveDay(d.day)}
                  className={`px-3 py-2 border-l border-gray-200 text-left flex flex-col ${
                    activeDay === d.day ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="text-[11px] font-semibold">{d.label}</span>
                  <span className="text-[11px] text-gray-500">{d.uiDate}</span>
                </button>
              ))}
            </div>

            {/* Rows */}
            {employees.length === 0 ? (
              <div className="px-4 py-4 text-sm text-gray-500">
                No active employees found for this business (or RLS blocked the
                query). Check that you and your employees have active employment
                rows for this business.
              </div>
            ) : (
              employees.map((e, rowIdx) => (
                <div
                  key={e.id}
                  className={`grid grid-cols-[minmax(220px,0.9fr)_repeat(7,minmax(90px,1fr))] text-xs ${
                    rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                  } border-t border-gray-100`}
                >
                  {/* Employee cell */}
                  <div className="px-4 py-2 flex flex-col justify-center">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {e.name}
                    </span>
                    <span className="text-[11px] text-gray-500 truncate">
                      {e.roleName}
                    </span>
                  </div>

                  {/* Day cells */}
                  {DAYS.map((d) => {
                    const draft = getDraft(e.id, d.day);
                    const isOff = isEmployeeOffOnDay(e.id, d.day);
                    const availWindow = getAvailabilityWindow(e.id, d.day);
                    const allowedWindow = computeAllowedWindowForDay(e.id, d.day);
                    const isUnavailableByAvail =
                      availWindow?.status === "unavailable";
                    const isPartial = availWindow?.status === "partial";

                    const isBlocked = isOff || isUnavailableByAvail || !allowedWindow;

                    let label: string;
                    if (isOff) {
                      label = "Time off";
                    } else if (isUnavailableByAvail) {
                      label = "Unavailable";
                    } else if (draft) {
                      label = formatRange12(draft.start, draft.end);
                    } else if (!allowedWindow) {
                      label = "Blocked";
                    } else {
                      label = "Add shift";
                    }

                    const partialStart = availWindow?.start ?? null;
                    const partialEnd = availWindow?.end ?? null;

                    const availHint = isPartial
                      ? `Partial availability ${formatTime12(
                          partialStart
                        )}–${formatTime12(partialEnd)}`
                      : availWindow
                      ? "Available"
                      : "";

                    return (
                      <button
                        key={d.day}
                        disabled={isOff || isUnavailableByAvail || !allowedWindow}
                        onClick={() => openEditor(e.id, d.day)}
                        className={`px-2 py-2 border-l border-gray-200 text-left flex flex-col justify-center transition-colors ${
                          draft
                            ? "bg-blue-50 hover:bg-blue-100"
                            : isBlocked
                            ? "bg-amber-50/70 text-amber-800 cursor-not-allowed"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-medium ${
                            draft
                              ? "text-blue-800"
                              : isBlocked
                              ? "text-amber-800"
                              : "text-gray-700"
                          }`}
                        >
                          {label}
                        </span>
                        {draft && (
                          <span className="text-[10px] text-gray-500 mt-0.5">
                            Click to edit ·{" "}
                            {/* span instead of nested button to avoid button-in-button */}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                removeDraft(e.id, d.day);
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  removeDraft(e.id, d.day);
                                }
                              }}
                              className="underline hover:text-gray-700 cursor-pointer"
                            >
                              remove
                            </span>
                          </span>
                        )}
                        {!draft && availHint && !isBlocked && (
                          <span className="text-[10px] text-gray-400 mt-0.5">
                            {availHint}
                          </span>
                        )}
                        {isBlocked && !isOff && !isUnavailableByAvail && (
                          <span className="text-[10px] text-amber-700 mt-0.5">
                            Outside availability / hours
                          </span>
                        )}
                        {isOff && (
                          <span className="text-[10px] text-amber-700 mt-0.5">
                            Approved time off
                          </span>
                        )}
                        {isUnavailableByAvail && (
                          <span className="text-[10px] text-amber-700 mt-0.5">
                            Marked unavailable
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={() => persistSchedule("draft")}
            className="px-6 py-2 border border-gray-300 text-gray-800 font-medium rounded-lg hover:bg-gray-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => persistSchedule("published")}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
          >
            Publish Schedule
          </button>
        </div>
      </div>

      {/* modal editor */}
      {editing && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Set Shift Time
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={startTime}
                  min={openHH}
                  max={closeHH}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End
                </label>
                <input
                  type="time"
                  value={endTime}
                  min={openHH}
                  max={closeHH}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDraftLocal}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                >
                  Save
                </button>
              </div>

              <p className="text-xs text-gray-500 pt-2">
                Shifts are constrained to store hours ({formatTime12(
                  openHH
                )}
                –{formatTime12(closeHH)}) and the employee&apos;s approved
                availability. Days with time off or &quot;unavailable&quot; cannot
                be scheduled.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

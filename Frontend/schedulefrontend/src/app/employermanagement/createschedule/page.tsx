"use client";

import React, { JSX, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
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

type WeeklyTimeRange = {
  start?: string | null;
  end?: string | null;
};

type WeeklyPatternPayload = {
  reason?: string | null;
  pattern?: Partial<Record<DayOfWeek, AvailabilityStatus>>;
  timeRanges?: Partial<Record<DayOfWeek, WeeklyTimeRange>>;
};

type AvailabilityRow = {
  id: UUID;
  user_id: UUID;
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
};

type Employee = {
  id: UUID;
  name: string;
  roleId?: UUID | null;
  roleName?: string;
};

type ShiftDraft = { employeeId: UUID; day: number; start: string; end: string };

type DayMeta = {
  day: number;
  label: string;
  uiDate: string;
  ymd: string;
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

type AvailabilityWindow = {
  status: AvailabilityStatus;
  start: string | null;
  end: string | null;
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

type LocationRowDb = {
  id: string;
  name: string;
};

type RoleRowDb = {
  id: string;
  name: string | null;
};

type PreviewByDayItem = {
  employeeName: string;
  roleName: string;
  start: string;
  end: string;
};

type EmployeePreviewEntry = {
  dayLabel: string;
  uiDate: string;
  start: string;
  end: string;
};

type EmployeePreview = {
  employeeId: string;
  employeeName: string;
  roleName: string;
  entries: EmployeePreviewEntry[];
};

type PreviewMode = "byDay" | "byEmployee";
type ScheduleCellState = {
  draft: ShiftDraft | undefined;
  label: string;
  isBlocked: boolean;
  isOff: boolean;
  isUnavailableByAvail: boolean;
  isPartial: boolean;
  availHint: string;
  partialStart: string | null;
  partialEnd: string | null;
  allowedWindow: { start: string; end: string } | null;
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
function startOfWeek(d: Date, weekStartsOn: number = 0) {
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
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
      const range = v as WeeklyTimeRange;
      const start =
        typeof range.start === "string" && range.start.trim().length > 0
          ? range.start
          : null;
      const end =
        typeof range.end === "string" && range.end.trim().length > 0
          ? range.end
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
  const idx = d.getDay();
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
  const [locations, setLocations] = useState<LocationRowDb[]>([]);
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

  const [timeOffByUser, setTimeOffByUser] = useState<Record<string, number[]>>({});
  const [availabilityByUser, setAvailabilityByUser] = useState<
    Record<string, Record<number, AvailabilityWindow>>
  >({});

  const [scheduleStatus, setScheduleStatus] = useState<
    "none" | "draft" | "published"
  >("none");

  const [weekStartDay, setWeekStartDay] = useState<number>(0);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsWeekStart, setSettingsWeekStart] = useState<number>(0);

  const [previewMode, setPreviewMode] = useState<PreviewMode>("byDay");
  const [toast, setToast] = useState<{ id: number; message: string; tone: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRemoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- Week days for active week ---------- */
  const DAYS: DayMeta[] = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const ws = startOfWeek(base, weekStartDay);
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
  }, [weekStartDay, weekOffset]);

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

    const storedWeekStart = localStorage.getItem(
      `scheduleWeekStartDay_${storedBiz}`
    );
    if (storedWeekStart != null) {
      const parsed = parseInt(storedWeekStart, 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 6) {
        setWeekStartDay(parsed);
        setSettingsWeekStart(parsed);
      }
    }
  }, []);

  useEffect(() => {
    setWeekOffset(0);
  }, [activeBusinessId]);

  useEffect(() => {
    return () => {
      if (toastHideRef.current) clearTimeout(toastHideRef.current);
      if (toastRemoveRef.current) clearTimeout(toastRemoveRef.current);
    };
  }, []);

  const handleLocationChange = (locationId: string) => {
    setActiveLocationId(locationId);
    if (typeof window !== "undefined") {
      const storedLocsRaw = localStorage.getItem("activeLocationIds");
      const storedLocs = storedLocsRaw ? (JSON.parse(storedLocsRaw) as string[]) : [];
      const newList = [locationId, ...storedLocs.filter((id) => id !== locationId)];
      localStorage.setItem("activeLocationIds", JSON.stringify(newList));
    }
  };

  const dismissToast = () => {
    if (toastHideRef.current) {
      clearTimeout(toastHideRef.current);
      toastHideRef.current = null;
    }
    if (toastRemoveRef.current) {
      clearTimeout(toastRemoveRef.current);
      toastRemoveRef.current = null;
    }
    setToastVisible(false);
    toastRemoveRef.current = setTimeout(() => {
      setToast(null);
      toastRemoveRef.current = null;
    }, 250);
  };

  const showToast = (message: string, tone: "success" | "error" = "success") => {
    if (toastHideRef.current) {
      clearTimeout(toastHideRef.current);
      toastHideRef.current = null;
    }
    if (toastRemoveRef.current) {
      clearTimeout(toastRemoveRef.current);
      toastRemoveRef.current = null;
    }
    setToast({ id: Date.now(), message, tone });
    setToastVisible(true);
    toastHideRef.current = setTimeout(() => {
      dismissToast();
    }, 3500);
  };

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

        // All locations
        const { data: allLocRaw, error: allLocErr } = await supabase
          .from("location")
          .select("id,name")
          .eq("business_id", activeBusinessId)
          .order("name", { ascending: true });

        if (allLocErr) {
          console.error("locations list load error", allLocErr);
        } else if (!cancelled) {
          const locRows = (allLocRaw ?? []) as LocationRowDb[];
          setLocations(locRows);

          if (!activeLocationId && locRows.length > 0) {
            setActiveLocationId(locRows[0].id);
          }
        }

        // Location details
        if (activeLocationId) {
          const { data: loc, error: locErr } = await supabase
            .from("location")
            .select("id,name,opens_at,closes_at")
            .eq("id", activeLocationId)
            .maybeSingle();

          if (locErr) console.error("location load error", locErr);

          if (!cancelled) {
            setLocationName(loc?.name ?? null);
            setOpenHH((loc as { opens_at?: string | null } | null)?.opens_at ?? "09:00");
            setCloseHH(
              (loc as { closes_at?: string | null } | null)?.closes_at ?? "17:00"
            );
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

        // Roles
        const { data: rolesRaw, error: rolesErr } = await supabase
          .from("role")
          .select("id,name")
          .eq("business_id", activeBusinessId);

        if (rolesErr) {
          console.error("role load error", rolesErr);
        }

        const roles = (rolesRaw ?? []) as RoleRowDb[];
        const roleNameBy = new Map<string, string>(
          roles.map((r) => [r.id, r.name || "—"])
        );

        // Profiles
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

        const emps: Employee[] = empRows.map((r) => {
          const roleId = r.role_id ?? null;
          const roleName =
            roleId != null
              ? roleNameBy.get(roleId) ?? "Role"
              : "No role assigned";
          return {
            id: r.user_id,
            name: nameBy.get(r.user_id) ?? "Unnamed",
            roleId,
            roleName,
          };
        });

        if (!cancelled) {
          setEmployees(emps.sort((a, b) => a.name.localeCompare(b.name)));
        }

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

        // Time off
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

        // Availability
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

            const internal: Record<
              string,
              Record<number, { window: AvailabilityWindow; effectiveFrom: Date }>
            > = {};

            for (const row of availRows) {
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

        // Existing schedule
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

              const employeeId = users[0];
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

  const computeAllowedWindowForDay = (
    empId: string,
    day: number | null
  ): { start: string; end: string } | null => {
    if (day == null) return null;
    if (isEmployeeOffOnDay(empId, day)) return null;

    const avail = getAvailabilityWindow(empId, day);

    if (!avail || avail.status === "available") {
      return { start: openHH, end: closeHH };
    }

    if (avail.status === "unavailable") {
      return null;
    }

    const window = intersectWindow(openHH, closeHH, avail.start, avail.end);
    return window;
  };

  const buildCellState = (empId: string, day: number): ScheduleCellState => {
    const draft = getDraft(empId, day);
    const isOff = isEmployeeOffOnDay(empId, day);
    const availWindow = getAvailabilityWindow(empId, day);
    const allowedWindow = computeAllowedWindowForDay(empId, day);
    const isUnavailableByAvail = availWindow?.status === "unavailable";
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
      ? `Partial availability ${formatTime12(partialStart)}–${formatTime12(partialEnd)}`
      : availWindow
      ? "Available"
      : "";

    return {
      draft,
      label,
      isBlocked,
      isOff,
      isUnavailableByAvail,
      isPartial,
      availHint,
      partialStart,
      partialEnd,
      allowedWindow,
    };
  };

  function openEditor(empId: string, day: number) {
    const allowed = computeAllowedWindowForDay(empId, day);
    if (!allowed) {
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
          showToast("Shifts created but assignments failed. See console.", "error");
        }
      }

      if (targetStatus === "draft") {
        showToast("Draft schedule saved. You can come back to publish it later.");
      } else {
        showToast("Schedule published.");
        setTimeout(() => {
          router.replace("/employermanagement/employerhomepage");
        }, 600);
      }

      setScheduleStatus(targetStatus);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Preview data ---------- */

  const previewByDay: Record<number, PreviewByDayItem[]> = useMemo(() => {
    const map: Record<number, PreviewByDayItem[]> = {};
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

  const previewByEmployee: EmployeePreview[] = useMemo(() => {
    const map: Record<string, EmployeePreview> = {};
    for (const draft of drafts) {
      const emp = employees.find((e) => e.id === draft.employeeId);
      if (!emp) continue;
      const dayMeta = DAYS[draft.day];
      if (!dayMeta) continue;

      if (!map[emp.id]) {
        map[emp.id] = {
          employeeId: emp.id,
          employeeName: emp.name,
          roleName: emp.roleName ?? "—",
          entries: [],
        };
      }
      map[emp.id].entries.push({
        dayLabel: dayMeta.label,
        uiDate: dayMeta.uiDate,
        start: draft.start,
        end: draft.end,
      });
    }

    const list = Object.values(map);
    for (const empPreview of list) {
      empPreview.entries.sort((a, b) => {
        const idxA = DAYS.findIndex(
          (d) => d.uiDate === a.uiDate && d.label === a.dayLabel
        );
        const idxB = DAYS.findIndex(
          (d) => d.uiDate === b.uiDate && d.label === b.dayLabel
        );
        return idxA - idxB;
      });
    }

    list.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return list;
  }, [drafts, employees, DAYS]);

  const totalShiftCount = drafts.length;
  const uniqueEmployeesScheduled = useMemo(
    () => new Set(drafts.map((d) => d.employeeId)).size,
    [drafts]
  );
  const totalScheduledMinutes = useMemo(
    () =>
      drafts.reduce((acc, d) => {
        return acc + (toMinutes(d.end) - toMinutes(d.start));
      }, 0),
    [drafts]
  );
  const totalScheduledHours = (totalScheduledMinutes / 60).toFixed(1);

  if (contextError && !activeBusinessId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="max-w-md bg-background border border-border rounded-2xl shadow-sm p-6 text-foreground">
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Schedule context missing
          </h1>
          <p className="text-sm text-foreground/70 mb-4">{contextError}</p>
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

  const DAY_LABELS: { label: string; value: number }[] = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
  ];

  const weekRangeLabel =
    DAYS.length === 7 ? `${DAYS[0].uiDate} – ${DAYS[6].uiDate}` : "";
  const weekStartDayLabel =
    DAY_LABELS.find((d) => d.value === weekStartDay)?.label ?? "Sunday";
  const settingsWeekStartLabel =
    DAY_LABELS.find((d) => d.value === settingsWeekStart)?.label ?? "Sunday";

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-background">

      {toast && (
        <div
          className={`pointer-events-none fixed left-1/2 top-4 z-50 w-full max-w-lg -translate-x-1/2 px-4 transform transition-all duration-300 ${
            toastVisible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
          }`}
          aria-live="polite"
        >
          <div
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-500 text-white"
                : "border-rose-200 bg-rose-500 text-white"
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="rounded-full border border-white/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition hover:bg-white/20"
              onClick={dismissToast}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 pt-6 pb-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Create schedule{locationName ? ` – ${locationName}` : ""}
            </h1>
            <p className="text-xs text-foreground/70">
              {businessName ?? "Your business"}
            </p>
          </div>
        </div>

        {/* Top row: location + store hours + status / week controls */}
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <section className="border border-border rounded-2xl bg-background/80 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Active location
                </p>
                <p className="text-base font-semibold text-foreground">
                  {locationName ?? "Select a location"}
                </p>
              </div>
              <span className="text-[11px] text-foreground/60">
                Week starts on {weekStartDayLabel}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-foreground/80">
                <span className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Switch location
                </span>
                <select
                  value={activeLocationId ?? ""}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
                >
                  {locations.length === 0 && <option value="">No locations</option>}
                  {locations.length > 0 && !activeLocationId && (
                    <option value="">Select location…</option>
                  )}
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-dashed border-border px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Store hours
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {formatTime12(openHH)} – {formatTime12(closeHH)}
                </p>
                <p className="text-xs text-foreground/60">Shifts must stay inside this range.</p>
              </div>
            </div>
          </section>

          <section className="border border-border rounded-2xl bg-background/80 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Current week
                </p>
                <p className="text-base font-semibold text-foreground">
                  {weekRangeLabel || "Select a week"}
                </p>
                <p className="text-xs text-foreground/60">
                  Status applies to this range.
                </p>
              </div>
              <span
                className={
                  scheduleStatus === "published"
                    ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700"
                    : scheduleStatus === "draft"
                    ? "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
                    : "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-background text-foreground/70 border border-border"
                }
              >
                {scheduleStatus === "none"
                  ? "No saved schedule"
                  : scheduleStatus === "draft"
                  ? "Draft (manager-only)"
                  : "Published"}
              </span>
            </div>

            <div className="space-y-2 text-xs text-foreground/70">
              <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                Move between weeks
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
                  <button
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="px-2 py-1 text-[11px] font-medium border-r border-border hover:bg-background/50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setWeekOffset(0)}
                    className="px-2 py-1 text-[11px] font-medium border-r border-border hover:bg-background/50"
                  >
                    This week
                  </button>
                  <button
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="px-2 py-1 text-[11px] font-medium hover:bg-background/50"
                  >
                    Next
                  </button>
                </div>
                <button
                  onClick={() => {
                    setSettingsWeekStart(weekStartDay);
                    setIsSettingsOpen(true);
                  }}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg border border-border bg-background text-[11px] font-medium text-foreground hover:bg-background/50"
                >
                  Schedule settings
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-background/60 border border-border/70 px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Shifts
                </p>
                <p className="text-2xl font-semibold text-foreground">{totalShiftCount}</p>
              </div>
              <div className="rounded-xl bg-background/60 border border-border/70 px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Employees
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {uniqueEmployeesScheduled}
                </p>
              </div>
              <div className="rounded-xl bg-background/60 border border-border/70 px-3 py-2 text-center">
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Total hours
                </p>
                <p className="text-2xl font-semibold text-foreground">
                  {totalScheduledHours}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Weekly preview card */}
        {drafts.length > 0 && (
          <section className="border border-border rounded-2xl bg-background shadow-sm p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {scheduleStatus === "draft"
                    ? "Draft schedule overview"
                    : "Schedule overview (active week)"}
                </h2>
                <p className="text-xs text-foreground/70">
                  See who is working each day or view the schedule grouped by
                  employee.
                </p>
              </div>
              <div className="inline-flex rounded-full border border-border bg-background overflow-hidden text-[11px]">
                <button
                  onClick={() => setPreviewMode("byDay")}
                  className={`px-3 py-1 font-medium ${
                    previewMode === "byDay"
                        ? "bg-background text-blue-700 dark:text-blue-300"
                          : "text-foreground/70 hover:bg-background/50"
                  }`}
                >
                  By day
                </button>
                <button
                  onClick={() => setPreviewMode("byEmployee")}
                  className={`px-3 py-1 font-medium border-l border-border ${
                    previewMode === "byEmployee"
                      ? "bg-background text-blue-700 dark:text-blue-300"
                        : "text-foreground/70 hover:bg-background/50"
                  }`}
                >
                  By employee
                </button>
              </div>
            </div>

            {previewMode === "byDay" ? (
              <div className="grid md:grid-cols-4 gap-3">
                {DAYS.map((d) => {
                  const items = previewByDay[d.day] ?? [];
                  return (
                    <div
                      key={d.day}
                      className="border border-border rounded-xl bg-background/60 p-3 min-h-[72px]"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-foreground">
                            {d.label}
                          </span>
                          <span className="text-[11px] text-foreground/60">
                            {d.uiDate}
                          </span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-background text-foreground border border-border">
                          {items.length} shift
                          {items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-[11px] text-foreground/60">No shifts</p>
                        ) : (
                        <ul className="space-y-1.5">
                          {items.map((item, idx) => {
                            const showRole =
                              item.roleName &&
                              item.roleName.trim().length > 0 &&
                              item.roleName !== "—" &&
                              item.roleName !== "No role assigned";
                            return (
                              <li
                                key={idx}
                                className="text-[11px] text-foreground flex flex-col"
                              >
                                <span className="font-medium truncate">
                                  {item.employeeName}
                                </span>
                                <span className="truncate text-foreground/70">
                                  {showRole ? (
                                    <>
                                      {item.roleName} ·{" "}
                                      {formatRange12(item.start, item.end)}
                                    </>
                                  ) : (
                                    formatRange12(item.start, item.end)
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-3">
                {previewByEmployee.map((emp) => {
                  const showRole =
                    emp.roleName &&
                    emp.roleName.trim().length > 0 &&
                    emp.roleName !== "—" &&
                    emp.roleName !== "No role assigned";
                  return (
                    <div
                      key={emp.employeeId}
                      className="border border-border rounded-xl bg-border/60 p-3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {emp.employeeName}
                          </span>
                          {showRole && (
                            <span className="text-[11px] text-foreground/70 truncate">
                              {emp.roleName}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-background text-foreground/70 border border-border">
                          {emp.entries.length} shift
                          {emp.entries.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <ul className="mt-1 space-y-1.5">
                        {emp.entries.map((entry, idx) => (
                          <li
                            key={idx}
                            className="text-[11px] text-foreground flex items-center justify-between gap-2"
                          >
                            <span className="text-foreground/70 truncate">
                              {entry.dayLabel} · {entry.uiDate}
                            </span>
                            <span className="font-medium text-foreground whitespace-nowrap">
                              {formatRange12(entry.start, entry.end)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {previewByEmployee.length === 0 && (
                  <p className="text-[11px] text-foreground/60">
                    No employees have shifts in this draft.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Mobile builder intro */}
        <section className="md:hidden border border-dashed border-border rounded-2xl bg-background/80 p-4 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-foreground/60">
            Schedule builder
          </p>
          <h2 className="text-base font-semibold text-foreground">
            Create this week&apos;s schedule
          </h2>
          <p className="text-xs text-foreground/70">
            Tap an employee card and pick a day to add or edit their shift. Changes stay in
            sync with the desktop grid view.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px]">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700">
              Off / unavailable
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">
              Has shift
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-border text-foreground/70 border border-border">
              Tap day to add / edit
            </span>
          </div>
        </section>

        {/* Mobile builder */}
        <section className="md:hidden border border-border rounded-2xl bg-background shadow-sm p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-foreground/60">
              Highlight day
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {DAYS.map((d) => (
                <button
                  key={`mobile-highlight-${d.day}`}
                  onClick={() => setActiveDay(d.day)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${
                    activeDay === d.day
                      ? "bg-blue-600 text-white border-blue-600"
                      : "text-foreground/70 border-border bg-background"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {employees.length === 0 ? (
              <p className="text-sm text-foreground/70">
                No active employees found for this business (or RLS blocked the query).
              </p>
            ) : (
              employees.map((e) => {
                const draftCount = drafts.filter((draft) => draft.employeeId === e.id).length;
                return (
                  <div
                    key={`mobile-${e.id}`}
                    className="rounded-2xl border border-border/80 bg-background/70 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{e.name}</p>
                        {e.roleName && (
                          <p className="text-[11px] text-foreground/60 truncate">{e.roleName}</p>
                        )}
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-background text-foreground/70">
                        {draftCount} shift{draftCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
                      {DAYS.map((d) => {
                        const cell = buildCellState(e.id, d.day);
                        const disabled =
                          cell.isOff || cell.isUnavailableByAvail || !cell.allowedWindow;
                        const blockedMessage = cell.isOff
                          ? "Approved time off"
                          : cell.isUnavailableByAvail
                          ? "Marked unavailable"
                          : "Outside availability / hours";

                        return (
                          <button
                            key={`${e.id}-${d.day}-mobile-day`}
                            type="button"
                            disabled={disabled}
                            onClick={() => openEditor(e.id, d.day)}
                            className={`flex-shrink-0 min-w-[140px] rounded-xl border px-3 py-2 text-left snap-center transition-colors ${
                              cell.draft
                                ? "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-100"
                                : disabled
                                ? "bg-amber-50/70 border-amber-200 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-100"
                                : "bg-background border-border text-foreground hover:bg-background/70"
                            } ${activeDay === d.day ? "ring-2 ring-blue-500" : ""}`}
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-wide">
                              {d.label}
                            </span>
                            <span className="text-xs font-medium block">{cell.label}</span>
                            {cell.draft ? (
                              <div className="mt-1 flex items-center justify-between text-[10px] text-foreground/70">
                                <span>Edit shift</span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="font-semibold text-blue-700 hover:underline focus:outline-none"
                                  onClick={(ev) => {
                                    ev.preventDefault();
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
                                >
                                  Remove
                                </span>
                              </div>
                            ) : disabled ? (
                              <span className="text-[10px] block mt-1">{blockedMessage}</span>
                            ) : cell.availHint ? (
                              <span className="text-[10px] text-foreground/60 block mt-1">
                                {cell.availHint}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Grid controls */}
        <section className="hidden md:flex md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/70">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700">
              Off / unavailable
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">
              Has shift
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-border text-foreground/70 border border-border">
              Click cell to add / edit
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-foreground/70">
            <span>Highlight day:</span>
            <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
              {DAYS.map((d) => (
                <button
                  key={d.day}
                  onClick={() => setActiveDay(d.day)}
                  className={`px-2 py-1 text-[11px] font-medium border-l border-border first:border-l-0 ${
                    activeDay === d.day
                      ? "bg-blue-50 text-blue-700"
                      : "text-foreground/70 hover:bg-background/50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Grid */}
        <section className="hidden md:block rounded-2xl border border-border bg-background shadow-sm overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Header row */}
            <div className="grid grid-cols-[minmax(220px,0.9fr)_repeat(7,minmax(90px,1fr))] border-b border-border bg-border text-xs font-semibold text-foreground/70">
              <div className="px-4 py-2 flex items-center justify-between">
                <span>Employee</span>
                <span className="text-[11px] text-foreground/60">Role</span>
              </div>
              {DAYS.map((d) => (
                <button
                  key={d.day}
                  onClick={() => setActiveDay(d.day)}
                  className={`px-3 py-2 border-l border-border text-left flex flex-col ${
                    activeDay === d.day ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="text-[11px] font-semibold">{d.label}</span>
                  <span className="text-[11px] text-foreground/70">{d.uiDate}</span>
                </button>
              ))}
            </div>

            {/* Rows */}
            {employees.length === 0 ? (
              <div className="px-4 py-4 text-sm text-foreground/70">
                No active employees found for this business (or RLS blocked the
                query). Check that you and your employees have active employment
                rows for this business.
              </div>
            ) : (
              employees.map((e, rowIdx) => (
                <div
                  key={e.id}
                    className={`grid grid-cols-[minmax(220px,0.9fr)_repeat(7,minmax(90px,1fr))] text-xs ${
                    rowIdx % 2 === 0 ? "bg-background" : "bg-background/60"
                  } border-t border-border`}
                >
                  {/* Employee cell */}
                  <div className="px-4 py-2 flex flex-col justify-center">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {e.name}
                    </span>
                    {e.roleName && (
                      <span className="text-[11px] text-foreground/60 truncate">
                        {e.roleName}
                      </span>
                    )}
                  </div>

                  {/* Day cells */}
                  {DAYS.map((d) => {
                    const cell = buildCellState(e.id, d.day);
                    const { draft, label, isBlocked, isOff, isUnavailableByAvail, availHint } =
                      cell;
                    const allowedWindow = cell.allowedWindow;

                    return (
                      <button
                        key={d.day}
                        disabled={isOff || isUnavailableByAvail || !allowedWindow}
                        onClick={() => openEditor(e.id, d.day)}
                        className={`px-2 py-2 border-l border-border text-left flex flex-col justify-center transition-colors ${
                          draft
                                ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-200"
                                  : isBlocked
                                  ? "bg-amber-50/70 text-amber-800 cursor-not-allowed dark:bg-amber-900 dark:text-amber-200"
                                  : "hover:bg-background/50"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-medium ${
                            draft
                              ? "text-blue-800 dark:text-blue-200"
                              : isBlocked
                              ? "text-amber-800 dark:text-amber-200"
                              : "text-foreground"
                          }`}
                        >
                          {label}
                        </span>
                        {draft && (
                          <span className="text-[10px] text-foreground/60 mt-0.5">
                            Click to edit ·{" "}
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
                              className="underline hover:text-foreground cursor-pointer"
                            >
                              remove
                            </span>
                          </span>
                        )}
                        {!draft && availHint && !isBlocked && (
                          <span className="text-[10px] text-foreground/60 mt-0.5">
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
        </section>

        {/* Actions */}
        <section className="flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={() => persistSchedule("draft")}
            className="px-6 py-2 border border-border text-foreground font-medium rounded-lg hover:bg-background/50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => persistSchedule("published")}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
          >
            Publish Schedule
          </button>
        </section>
      </div>

      {/* Schedule settings modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6 border border-border text-foreground">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                  Schedule controls
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  Schedule settings
                </h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-foreground/60 hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-foreground/70 mb-4">
              Adjust when the scheduling week starts so managers always work with the same view.
            </p>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/80 bg-background/60 p-4 space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                    First day of the schedule week
                  </p>
                  <select
                    value={settingsWeekStart}
                    onChange={(e) => setSettingsWeekStart(parseInt(e.target.value, 10))}
                    className="w-full mt-2 px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-background text-foreground"
                  >
                    {DAY_LABELS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-foreground/70 space-y-1">
                  <p>
                    Currently set to <span className="font-semibold text-foreground">{settingsWeekStartLabel}</span>.
                  </p>
                  <p>
                    Your grid will reorder to start on this day for every manager working in this business.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 px-4 py-2 border border-border text-foreground font-medium rounded-lg hover:bg-background/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setWeekStartDay(settingsWeekStart);
                    if (activeBusinessId && typeof window !== "undefined") {
                      localStorage.setItem(
                        `scheduleWeekStartDay_${activeBusinessId}`,
                        String(settingsWeekStart)
                      );
                    }
                    setIsSettingsOpen(false);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                >
                  Save settings
                </button>
              </div>

              <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-3 text-xs text-foreground/70">
                <p>
                  Tip: you can still jump between weeks with the Previous / This week / Next controls on the main page. Settings here simply lock the starting day so everyone sees the same layout.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* modal editor */}
      {editing && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6 border border-border text-foreground">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Set Shift Time
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="text-foreground/60 hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={startTime}
                  min={openHH}
                  max={closeHH}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">
                  End
                </label>
                <input
                  type="time"
                  value={endTime}
                  min={openHH}
                  max={closeHH}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2 border border-border text-foreground font-medium rounded-lg hover:bg-background/50"
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

              <p className="text-xs text-foreground/70 pt-2">
                Shifts are constrained to store hours ({formatTime12(openHH)}–
                {formatTime12(closeHH)}) and the employee&apos;s approved
                availability. Days with time off or &quot;unavailable&quot; cannot be
                scheduled.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

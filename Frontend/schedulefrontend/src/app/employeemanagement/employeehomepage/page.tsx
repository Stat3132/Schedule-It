"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createAnnouncement } from "../../../lib/announcements";
import { Calendar, Clock, Bell, Settings, LogOut, AlertCircle } from "lucide-react";
import { useI18n } from "../../../lib/i18n";

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

type AnnouncementLite = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  target_role_ids?: string[] | null;
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

function fmtDateMMDD(d: Date, locale?: string): string {
  return d.toLocaleDateString(locale ?? undefined, {
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtTimeLocal(iso: string, locale?: string): string {
  const dt = new Date(iso);
  return dt.toLocaleTimeString(locale ?? undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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
  const { t, locale } = useI18n();

  const weekdayLabels = useMemo(
    () => DAY_KEYS.map((day) => t(`shared.weekdays.${day}`)),
    [t],
  );
  const shiftFallbackLabel = useMemo(
    () => t("employee.home.labels.shiftFallback"),
    [t],
  );
  const typicalShiftLabel = useMemo(
    () => t("employee.home.labels.typicalShift"),
    [t],
  );
  const weekPrefix = useMemo(() => t("employee.home.week.prefix"), [t]);
  const typicalWeekSuffix = useMemo(
    () => t("employee.home.week.typicalSuffix"),
    [t],
  );

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employmentState, setEmploymentState] = useState<Employment | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [weekLabel, setWeekLabel] = useState<string>("");
  const [days, setDays] = useState<DayBucket[]>([]);
  const [hadRealAssignments, setHadRealAssignments] = useState<boolean>(false);
  const [dayFlags, setDayFlags] = useState<Record<number, DayFlags>>({});
  const [droppedShifts, setDroppedShifts] = useState<DroppedShift[]>([]);

  const [selectedShift, setSelectedShift] = useState<SelectedShift | null>(null);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [coworkersLoading, setCoworkersLoading] = useState(false);
  const [dropReason, setDropReason] = useState("");
  const [dropSubmitting, setDropSubmitting] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [announcementToShow, setAnnouncementToShow] = useState<{
    announcement: AnnouncementLite;
    senderName: string;
  } | null>(null);
  const [announcementDeleteLoading, setAnnouncementDeleteLoading] =
    useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  const maybeShowAnnouncementForUser = async (
    userId: string,
    roleId: string | null,
  ) => {
    if (!roleId) return;
    if (typeof window === "undefined") return;

    const { data, error } = await supabase
      .from("announcements")
      .select("id,title,content,created_at,created_by,target_role_ids")
      .order("created_at", { ascending: false });

    if (error || !data) {
      if (error) console.error("[EmployeeHome] load announcements error", error);
      return;
    }

    const all = data as AnnouncementLite[];

    const applicable = all.filter((a) => {
      if (a.created_by === userId) return false;
      const targets = a.target_role_ids;
      if (!targets || targets.length === 0) return true; // broadcast
      return targets.includes(roleId);
    });

    if (applicable.length === 0) return;

    // Show the newest applicable announcement the user hasn't seen yet.
    // Read seen announcements for this user
    let seenIds: string[] = [];
    try {
      const raw = window.localStorage.getItem(`seenAnnouncements:${userId}`);
      if (raw) seenIds = JSON.parse(raw) as string[];
    } catch {
      seenIds = [];
    }

    const firstUnseen = applicable.find((a) => !seenIds.includes(a.id));
    if (!firstUnseen) return;

    const { data: sender, error: senderErr } = await supabase
      .from("profiles")
      .select("full_name,display_name,email")
      .eq("id", firstUnseen.created_by)
      .maybeSingle();

    if (senderErr) {
      console.error("[EmployeeHome] load announcement sender error", senderErr);
    }

    const senderName =
      (sender?.full_name as string | null) ||
      (sender?.display_name as string | null) ||
      (sender?.email as string | null) ||
      t("shared.messages.managerFallback");

    // Mark as seen and persist
    try {
      if (!seenIds.includes(firstUnseen.id)) {
        seenIds.push(firstUnseen.id);
        window.localStorage.setItem(
          `seenAnnouncements:${userId}`,
          JSON.stringify(seenIds),
        );
      }
    } catch {
      // ignore storage errors
    }

    setAnnouncementToShow({ announcement: firstUnseen, senderName });
  };

  const handleDismissAnnouncement = () => {
    if (!announcementToShow || !currentUserId) {
      setAnnouncementToShow(null);
      return;
    }
    if (typeof window === "undefined") {
      setAnnouncementToShow(null);
      return;
    }

    const storageKey = `seenAnnouncements:${currentUserId}`;
    let seen: string[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) seen = JSON.parse(raw);
    } catch {
      // ignore
    }

    if (!seen.includes(announcementToShow.announcement.id)) {
      seen.push(announcementToShow.announcement.id);
      window.localStorage.setItem(storageKey, JSON.stringify(seen));
    }

    setAnnouncementToShow(null);
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    setAnnouncementDeleteLoading(true);
    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", announcementId);
      if (error) {
        console.error("[EmployeeHome] delete announcement error", error);
      }
    } finally {
      setAnnouncementDeleteLoading(false);
      setAnnouncementToShow(null);
    }
  };

  const announcementTimestampLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

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
          setWeekLabel(labelForWeek(new Date(), locale, weekPrefix));
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
          setWeekLabel(labelForWeek(new Date(), locale, weekPrefix));
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
      const label = labelForWeek(now, locale, weekPrefix);

      const flagsByIndex: Record<number, DayFlags> = {};
      for (let i = 0; i < 7; i++) {
        flagsByIndex[i] = {
          hasTimeOff: false,
          isUnavailableByAvailability: false,
        };
      }

      const todayISODate = now.toISOString().split("T")[0];

      // 3a) Availability
      try {
        const { data: availRows, error: availErr } = await supabase
          .from("availability")
          .select("weekly_pattern_json,effective_from,effective_to,status")
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

      // 3b) Time off
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
            const endRaw = new Date(r.end_ts);
            const lastIncluded = new Date(endRaw.getTime() - 1);

            let cur = normalizeToLocalDay(startRaw);
            const lastDay = normalizeToLocalDay(lastIncluded);

            while (cur <= lastDay) {
              const curMs = cur.getTime();
              if (
                curMs >= normalizeToLocalDay(weekStart).getTime() &&
                curMs <= normalizeToLocalDay(weekEnd).getTime()
              ) {
                const idx = cur.getDay();
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

      // 4) Assignments for user
      const { data: saRows, error: saErr } = await supabase
        .from("shift_assignment")
        .select(
          "id,shift_id,user_id,assigned_by,assigned_at,status,source,drop_reason,responded_at",
        )
        .eq("user_id", uid);

      if (!saErr && saRows && saRows.length > 0) {
        const assignments = saRows as ShiftAssignmentRow[];

        const shiftIds: string[] = Array.from(
          new Set(assignments.map((r) => r.shift_id)),
        );

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
              : Promise.resolve({ data: null } as { data: RoleRow[] | null }),
            locIds.length
              ? supabase.from("location").select("id,name").in("id", locIds)
              : Promise.resolve({
                  data: null,
                } as { data: LocationRow[] | null }),
          ]);

          const roleById: Record<string, RoleRow> = {};
          if (roles)
            for (const r of roles as RoleRow[]) roleById[r.id] = r;

          const locById: Record<string, LocationRow> = {};
          if (locs)
            for (const l of locs as LocationRow[]) locById[l.id] = l;

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
            const role = roleById[s.role_id]?.name ?? shiftFallbackLabel;
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
                start: fmtTimeLocal(s.start_ts, locale),
                end: fmtTimeLocal(s.end_ts, locale),
                status: "dropped",
              });
              activeShiftRows.push(s);
            } else if (a.status !== "declined") {
              activeShiftRows.push(s);
            }
          }

          const withMeta: ShiftWithMeta[] = activeShiftRows.map((s) => ({
            shift: s,
            role: roleById[s.role_id] ?? null,
            location: locById[s.location_id] ?? null,
          }));

          const buckets = buildBucketsFromShifts(
            withMeta,
            assignmentByShiftId,
            locale,
            shiftFallbackLabel,
          );

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

      // 6) Fallback templates
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
            locale,
            typicalShiftLabel,
          );
      }

      if (!cancelled) {
        if (bucketsFromTemplates) {
          setDays(bucketsFromTemplates);
          setWeekLabel(`${label} • ${typicalWeekSuffix}`);
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
  }, [
    supabase,
    refreshKey,
    locale,
    weekPrefix,
    shiftFallbackLabel,
    typicalShiftLabel,
    typicalWeekSuffix,
  ]);

  // When we know the current user and employment, check for announcements
  useEffect(() => {
    (async () => {
      if (!currentUserId || !employmentState) return;
      await maybeShowAnnouncementForUser(currentUserId, employmentState.role_id);
    })();
  }, [currentUserId, employmentState, supabase, t]);

  const todayIdx = new Date().getDay();
  const todayFlags = dayFlags[todayIdx];

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
        name:
          p.full_name || p.display_name || p.email || t("shared.labels.unnamed"),
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
    if (!s.shiftId || s.isDropPending) return;
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
      setDropError(t("employee.home.errors.reasonRequired"));
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
        setDropError(t("employee.home.errors.dropFailed"));
        setDropSubmitting(false);
        return;
      }

      setSelectedShift(null);
      setDropReason("");
      setDropError(null);
      setRefreshKey((k) => k + 1);

      // create announcement for dropped shift
      try {
        let senderName = t("shared.messages.employeeFallback");
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name,display_name,email")
            .eq("id", currentUserId)
            .maybeSingle();
          if (prof) senderName = prof.full_name || prof.display_name || prof.email || senderName;
        } catch {
          // ignore profile lookup errors
        }

        const title = t("employee.home.drop.announcementTitle", { name: senderName });
        const baseContent = t("employee.home.drop.announcementBody", {
          day: weekdayLabels[selectedShift.weekdayIndex],
          date: fmtDateMMDD(selectedShift.date, locale),
          range: `${selectedShift.start} – ${selectedShift.end}`,
        });
        const reasonBlock = reason
          ? `\n\n${t("shared.labels.reason")}: ${reason}`
          : "";
        const content = `${baseContent}${reasonBlock}`;
        if (currentUserId) {
          await createAnnouncement(supabase, currentUserId, title, content, []);
        }
      } catch (e) {
        console.error("Failed to create announcement for dropped shift:", e);
      }
    } catch (e) {
      console.error("[EmployeeHome] drop shift exception", e);
      setDropError(t("employee.home.errors.generic"));
    } finally {
      setDropSubmitting(false);
    }
  };

  // ---- Render ----
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">
            {t("employee.home.title")}
          </h1>
          <p className="text-foreground/70 mt-1">
            {loading ? t("shared.state.loading") : weekLabel}
            {!loading && !hadRealAssignments
              ? t("employee.home.week.noAssignments")
              : ""}
          </p>

          {!loading &&
            todayFlags &&
            (todayFlags.hasTimeOff || todayFlags.isUnavailableByAvailability) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {todayFlags.hasTimeOff && (
                  <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {todayFlags.timeOffStatus === "approved"
                      ? t("employee.home.alerts.timeOffApproved")
                      : t("employee.home.alerts.timeOffRequested")}
                  </div>
                )}
                {todayFlags.isUnavailableByAvailability && (
                  <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-800">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {t("employee.home.alerts.unavailable")}
                  </div>
                )}
              </div>
            )}
        </div>

        <div className="bg-background rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-border">
            {days.map((bucket: DayBucket) => {
              const flags = dayFlags[bucket.dayIndex];

              return (
                <div
                  key={bucket.dayIndex}
                  className="bg-background p-4 min-h-[200px] flex flex-col"
                >
                  <div className="text-center mb-2">
                    <div className="text-sm font-semibold text-foreground">
                        {weekdayLabels[bucket.dayIndex]}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">
                      {fmtDateMMDD(bucket.date, locale)}
                    </div>
                  </div>

                  {flags &&
                    (flags.hasTimeOff || flags.isUnavailableByAvailability) && (
                      <div className="mb-3 space-y-1">
                        {flags.hasTimeOff && (
                          <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                            {flags.timeOffStatus === "approved"
                              ? t("employee.home.dayStatus.timeOffApproved")
                              : t("employee.home.dayStatus.timeOffRequested")}
                          </div>
                        )}
                        {flags.isUnavailableByAvailability && (
                          <div className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-medium text-purple-800">
                            {t("employee.home.dayStatus.unavailableAvailability")}
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
                                  {t("employee.home.shiftTags.pickedUp")}
                                </span>
                              )}
                              {s.isDropPending && (
                                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                  {t("employee.home.shiftTags.dropPending")}
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
                        <div className="text-xs text-foreground/60">
                          {flags?.hasTimeOff
                            ? flags.timeOffStatus === "approved"
                              ? t("employee.home.dayStatus.timeOffApproved")
                              : t("employee.home.dayStatus.timeOffRequested")
                            : flags?.isUnavailableByAvailability
                            ? t("employee.home.dayStatus.unavailable")
                            : t("employee.home.dayStatus.off")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">
            {t("employee.home.section.dropped.title")}
          </h2>
          <p className="text-sm text-foreground/70 mt-1">
            {t("employee.home.section.dropped.description")}
          </p>

          <div className="mt-3 bg-background rounded-xl shadow-sm border border-border overflow-hidden">
            {droppedShifts.length === 0 ? (
              <div className="px-4 py-6 text-sm text-foreground/60 text-center">
                {t("employee.home.section.dropped.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {droppedShifts.map((ds) => (
                  <li
                    key={ds.assignmentId}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {weekdayLabels[ds.weekdayIndex]} · {fmtDateMMDD(ds.date, locale)}
                      </div>
                      <div className="text-xs text-foreground/70 mt-0.5">
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
                      {t("employee.home.section.dropped.badge")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* Announcement popup */}
      {announcementToShow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between border-b border-border/70 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                  {t("employee.home.announcement.newLabel")}
                </p>
                <h2 className="text-xl font-semibold text-foreground">
                  {announcementToShow.announcement.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("employee.announcements.from", {
                    name: announcementToShow.senderName,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDismissAnnouncement}
                className="rounded-full border border-border/70 p-1 text-muted-foreground transition hover:border-border hover:text-foreground"
              >
                <span className="sr-only">{t("shared.buttons.close")}</span>
                ×
              </button>
            </div>
            <div className="px-6 py-5 text-sm leading-relaxed text-foreground">
              {announcementToShow.announcement.content}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border/70 px-6 py-4 text-xs text-muted-foreground">
              <span>
                {t("employee.home.announcement.timestamp", {
                  time: announcementTimestampLabel(
                    announcementToShow.announcement.created_at,
                  ),
                })}
              </span>
              <div className="flex gap-2">
                {announcementToShow.announcement.created_by ===
                  currentUserId && (
                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteAnnouncement(announcementToShow.announcement.id)
                    }
                    disabled={announcementDeleteLoading}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive/80 hover:border-destructive disabled:opacity-50"
                  >
                    {announcementDeleteLoading
                      ? t("employee.home.announcement.deleting")
                      : t("employee.home.announcement.delete")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDismissAnnouncement}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  {t("shared.buttons.gotIt")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  {weekdayLabels[selectedShift.weekdayIndex]} · {" "}
                  {fmtDateMMDD(selectedShift.date, locale)} · {selectedShift.start} –{" "}
                  {selectedShift.end}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">{t("shared.buttons.close")}</span>
                ×
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">
                {t("employee.home.coworkers.header")}
              </h3>
              {coworkersLoading ? (
                <p className="mt-1 text-sm text-gray-500">
                  {t("shared.state.loading")}
                </p>
              ) : coworkers.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">
                  {t("employee.home.coworkers.empty")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto text-sm text-gray-700">
                  {coworkers.map((c) => (
                    <li key={c.id}>
                      {c.name}
                      {c.id === currentUserId
                        ? ` ${t("shared.labels.youIndicator")}`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                {t("employee.home.modal.reasonLabel")}
              </label>
              <textarea
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder={t("employee.home.modal.reasonPlaceholder")}
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
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmDrop}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60"
                disabled={dropSubmitting}
              >
                {dropSubmitting
                  ? t("employee.home.modal.submitting")
                  : t("employee.home.modal.confirm")}
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

function labelForWeek(reference: Date, locale?: string, prefix = "Week of"): string {
  const start = startOfWeek(reference, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = start.toLocaleDateString(locale ?? undefined, {
    month: "long",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString(locale ?? undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${prefix} ${startLabel} - ${endLabel}`;
}

function buildBucketsFromShifts(
  rows: ShiftWithMeta[],
  assignmentByShiftId: Record<string, ShiftAssignmentRow>,
  locale?: string,
  shiftFallback = "Shift",
): DayBucket[] {
  const buckets = defaultEmptyWeek();
  for (const r of rows) {
    const s = new Date(r.shift.start_ts);
    const idx = s.getDay();
    const roleName = r.role?.name ?? shiftFallback;
    const color = r.role?.color ?? null;
    const locationName = r.location?.name ?? null;
    const assignment = assignmentByShiftId[r.shift.id];

    buckets[idx].shifts.push({
      shiftId: r.shift.id,
      assignmentId: assignment?.id ?? null,
      role: roleName,
      start: fmtTimeLocal(r.shift.start_ts, locale),
      end: fmtTimeLocal(r.shift.end_ts, locale),
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
  locale?: string,
  typicalShiftLabel = "Typical shift",
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
      role: typicalShiftLabel,
      start: s.toLocaleTimeString(locale ?? undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
      end: e.toLocaleTimeString(locale ?? undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
      color: null,
      locationName: null,
    });
  }
  for (const b of buckets) {
    b.shifts.sort((a, b2) => a.start.localeCompare(b2.start));
  }
  return buckets;
}

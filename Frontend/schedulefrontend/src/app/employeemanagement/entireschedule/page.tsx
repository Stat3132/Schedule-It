"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createAnnouncement } from "../../../lib/announcements";
import { useI18n } from "../../../lib/i18n";
import type { User } from "@supabase/supabase-js";

/* ---------- Helpers ---------- */

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const d = new Date(start);
  d.setDate(d.getDate() + 7);
  return d;
}

/* ---------- Types ---------- */

type UUID = string;

type BasicUser = {
  id: UUID;
  full_name: string | null;
};

type BasicLocation = {
  id?: UUID;
  name: string | null;
};

type BasicRole = {
  id?: UUID;
  name: string | null;
};

type ShiftSummary = {
  id: UUID;
  start_ts: string;
  end_ts: string;
  location: BasicLocation | null;
  role: BasicRole | null;
};

type DropAssignment = {
  id: UUID;
  drop_reason: string | null;
  shift: ShiftSummary;
  user: BasicUser | null;
};

type MyDroppedAssignment = {
  id: UUID;
  drop_reason: string | null;
  shift: ShiftSummary;
};

type MyPickupRequest = {
  id: UUID;
  reason: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
  created_at: string;
  assignment: {
    id: UUID;
    shift: ShiftSummary;
    user: BasicUser | null;
  };
};

type WeekShift = {
  id: UUID;
  start_ts: string;
  end_ts: string;
  location: BasicLocation | null;
  role: BasicRole | null;
  assignments: {
    id: UUID;
    status: string;
    user: BasicUser | null;
  }[];
};

function formatDate(d: string, locale?: string) {
  const date = new Date(d);
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start: string, end: string, locale?: string) {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${s.toLocaleTimeString(locale, opts)} – ${e.toLocaleTimeString(
    locale,
    opts,
  )}`;
}

function toYmd(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/* ---------- Page ---------- */

export default function EmployeeSchedulePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { t, locale } = useI18n();

  const [user, setUser] = useState<User | null>(null);
  const [, setBusinessId] = useState<UUID | null>(null);

  const [availableDrops, setAvailableDrops] = useState<DropAssignment[]>([]);
  const [myDropped, setMyDropped] = useState<MyDroppedAssignment[]>([]);
  const [myPickupRequests, setMyPickupRequests] = useState<MyPickupRequest[]>([]);
  const [weekShifts, setWeekShifts] = useState<WeekShift[]>([]);

  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] =
    useState<DropAssignment | null>(null);
  const [pickupReason, setPickupReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* ----- Week meta (for header) ----- */

  const weekDays = useMemo(() => {
    const today = new Date();
    const ws = startOfWeek(today);
    const days: { label: string; dateLabel: string; ymd: string }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      const label = d.toLocaleDateString(locale, { weekday: "short" });
      const dateLabel = d.toLocaleDateString(locale, {
        month: "numeric",
        day: "numeric",
      });
      days.push({
        label,
        dateLabel,
        ymd: d.toISOString().slice(0, 10),
      });
    }
    return days;
  }, [locale]);

  /* ----- Load everything ----- */

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // 1) Auth user
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) {
        router.push("/login");
        return;
      }
      setUser(authData.user);

      // 2) Active employment → business context
      const { data: employment, error: empError } = await supabase
        .from("employment")
        .select("id,business_id")
        .eq("user_id", authData.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (empError) throw empError;
      if (!employment) {
        setErrorMsg(t("employee.schedule.errors.noEmployment"));
        setAvailableDrops([]);
        setMyDropped([]);
        setMyPickupRequests([]);
        setWeekShifts([]);
        return;
      }

      const bizId: UUID = employment.business_id;
      setBusinessId(bizId);

      const now = new Date();
      const weekStart = startOfWeek(now);
      const weekEnd = endOfWeek(now);
      const weekStartIso = weekStart.toISOString();
      const weekEndIso = weekEnd.toISOString();

      // 3) Parallel queries (no nested-order; we sort in JS)
      const [droppedRes, myDroppedRes, pickupRes, scheduleRes] =
        await Promise.all([
          supabase
            .from("shift_assignment")
            .select(
              `
              id,
              drop_reason,
              shift:shift_id (
                id,
                start_ts,
                end_ts,
                business_id,
                location:location_id ( id, name ),
                role:role_id ( id, name )
              ),
              user:user_id ( id, full_name )
            `
            )
            .eq("status", "dropped")
            .eq("shift.business_id", bizId)
            .gte("shift.start_ts", weekStartIso)
            .lt("shift.start_ts", weekEndIso),

          supabase
            .from("shift_assignment")
            .select(
              `
              id,
              drop_reason,
              shift:shift_id (
                id,
                start_ts,
                end_ts,
                business_id,
                location:location_id ( id, name ),
                role:role_id ( id, name )
              )
            `
            )
            .eq("user_id", authData.user.id)
            .eq("status", "dropped")
            .gte("shift.start_ts", weekStartIso)
            .lt("shift.start_ts", weekEndIso),

          supabase
            .from("shift_pickup_request")
            .select(
              `
              id,
              reason,
              status,
              created_at,
              assignment:shift_assignment_id (
                id,
                shift:shift_id (
                  id,
                  start_ts,
                  end_ts,
                  location:location_id ( id, name ),
                  role:role_id ( id, name )
                ),
                user:user_id ( id, full_name )
              )
            `
            )
            .eq("requester_user_id", authData.user.id)
            .order("created_at", { ascending: false }),

          supabase
            .from("shift")
            .select(
              `
              id,
              start_ts,
              end_ts,
              location:location_id ( id, name ),
              role:role_id ( id, name ),
              assignments:shift_assignment (
                id,
                status,
                user:user_id ( id, full_name )
              )
            `
            )
            .eq("status", "published")
            .eq("business_id", bizId)
            .gte("start_ts", weekStartIso)
            .lt("start_ts", weekEndIso)
            .order("start_ts", { ascending: true }),
        ]);

      if (droppedRes.error) throw droppedRes.error;
      if (myDroppedRes.error) throw myDroppedRes.error;
      if (pickupRes.error) throw pickupRes.error;
      if (scheduleRes.error) throw scheduleRes.error;

      type RawDropRow = { shift: { start_ts: string }; [key: string]: unknown };
      const droppedData = (droppedRes.data ?? []) as unknown as RawDropRow[];
      const myDroppedData = (myDroppedRes.data ?? []) as unknown as RawDropRow[];

      droppedData.sort(
        (a, b) =>
          new Date(a.shift.start_ts).getTime() -
          new Date(b.shift.start_ts).getTime()
      );
      myDroppedData.sort(
        (a, b) =>
          new Date(a.shift.start_ts).getTime() -
          new Date(b.shift.start_ts).getTime()
      );

      setAvailableDrops(droppedData as DropAssignment[]);
      setMyDropped(myDroppedData as MyDroppedAssignment[]);
      setMyPickupRequests(
        (pickupRes.data ?? []) as unknown as MyPickupRequest[]
      );
      setWeekShifts((scheduleRes.data ?? []) as unknown as WeekShift[]);
      // Dev debug: log returned weekShifts shape to help diagnose missing assignments
      // (remove or guard in production)
      try {
        console.debug("loaded weekShifts:", scheduleRes.data);
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      console.error("Error loading employee schedule page:", err);
      if (err instanceof Error)
        setErrorMsg(err.message ?? t("employee.schedule.errors.load"));
      else setErrorMsg(String(err ?? t("employee.schedule.errors.load")));
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  /* ----- Modal actions ----- */

  const openPickupModal = (assignment: DropAssignment) => {
    setSelectedAssignment(assignment);
    setPickupReason("");
    setPickupModalOpen(true);
  };

  const submitPickupRequest = async () => {
    if (!selectedAssignment || !user) return;
    try {
      const { error } = await supabase.from("shift_pickup_request").insert({
        shift_assignment_id: selectedAssignment.id,
        requester_user_id: user.id,
        reason: pickupReason || null,
        status: "pending",
      });

      if (error) throw error;

      // Create announcement for pickup request
      try {
        const sender =
          userFullName || user.email || t("shared.messages.employeeFallback");
        const title = t("employee.schedule.pickup.announcementTitle", {
          name: sender,
        });
        const baseBody = t("employee.schedule.pickup.announcementBody", {
          date: formatDate(selectedAssignment.shift.start_ts, locale),
          range: formatTimeRange(
            selectedAssignment.shift.start_ts,
            selectedAssignment.shift.end_ts,
            locale,
          ),
        });
        const locationBlock = selectedAssignment.shift.location?.name
          ? `\n\n${t("employee.schedule.labels.location")}: ${selectedAssignment.shift.location.name}`
          : "";
        const reasonBlock = pickupReason
          ? `\n\n${t("shared.labels.reason")}: ${pickupReason}`
          : "";
        await createAnnouncement(
          supabase,
          user.id,
          title,
          `${baseBody}${locationBlock}${reasonBlock}`,
          [],
        );
      } catch (e) {
        console.error("Failed to create announcement for pickup request:", e);
      }

      setPickupModalOpen(false);
      setSelectedAssignment(null);
      setPickupReason("");
      void refreshAll();
    } catch (err: unknown) {
      console.error("Error creating pickup request:", err);
      if (err instanceof Error)
        setErrorMsg(err.message ?? t("employee.schedule.errors.pickup"));
      else setErrorMsg(t("employee.schedule.errors.pickup"));
    }
  };

  /* ----- Render helpers ----- */

  const renderStatusBadge = (status: string) => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
    const labelMap: Record<string, string> = {
      pending: t("shared.status.pending"),
      approved: t("shared.status.approved"),
      denied: t("shared.status.denied"),
      canceled: t("shared.status.canceled"),
    };
    const label = labelMap[status] ?? status;
    switch (status) {
      case "pending":
        return <span className={`${base} bg-amber-100 text-amber-800`}>{label}</span>;
      case "approved":
        return (
          <span className={`${base} bg-emerald-100 text-emerald-800`}>{label}</span>
        );
      case "denied":
        return <span className={`${base} bg-rose-100 text-rose-800`}>{label}</span>;
      case "canceled":
        return <span className={`${base} bg-gray-100 text-gray-700`}>{label}</span>;
      default:
        return (
          <span className={`${base} bg-gray-100 text-gray-700`}>{label}</span>
        );
    }
  };

  const myId = user?.id ?? null;

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return "";
    const first = weekDays[0]?.dateLabel;
    const last = weekDays[weekDays.length - 1]?.dateLabel;
    return first && last ? `${first} – ${last}` : "";
  }, [weekDays]);

  const myWeekShifts = useMemo(() => {
    if (!myId) return [] as WeekShift[];
    return weekShifts.filter((s) =>
      s.assignments.some((a) => getAssignmentUserId(a) === myId)
    );
  }, [weekShifts, myId]);

  const totalScheduledMinutes = useMemo(() => {
    return myWeekShifts.reduce((acc, shift) => {
      const start = new Date(shift.start_ts);
      const end = new Date(shift.end_ts);
      return acc + Math.max(0, (end.getTime() - start.getTime()) / 60000);
    }, 0);
  }, [myWeekShifts]);

  const totalScheduledHours = (totalScheduledMinutes / 60).toFixed(1);

  const primaryRoleName = useMemo(() => {
    if (!myId) return null;
    const firstWithMe = weekShifts.find((s) =>
      s.assignments.some((a) => getAssignmentUserId(a) === myId)
    );
    return firstWithMe?.role?.name ?? null;
  }, [weekShifts, myId]);

  function getAssignmentUserId(assignment: unknown): UUID | null {
    if (!assignment || typeof assignment !== "object") return null;
    const obj = assignment as Record<string, unknown>;
    const userVal = obj.user ?? obj.user_id ?? obj.userId;
    if (!userVal) return null;
    if (typeof userVal === "string") return userVal as UUID;
    if (typeof userVal === "object" && userVal !== null) {
      const u = userVal as Record<string, unknown>;
      if (typeof u.id === "string") return u.id as UUID;
    }
    return null;
  }

  const userFullName = (() => {
    const meta = user?.user_metadata as unknown;
    if (meta && typeof meta === "object" && "full_name" in meta) {
      const m = meta as { full_name?: unknown };
      return typeof m.full_name === "string" ? m.full_name : undefined;
    }
    return undefined;
  })();

  /* ---------- JSX ---------- */

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-10 space-y-6">
        <section className="border border-border rounded-2xl bg-card shadow-sm p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/50">
                {t("employee.schedule.labels.mySchedule")}
              </p>
              <h1 className="text-2xl font-semibold text-foreground">
                {t("employee.schedule.title")}
              </h1>
              <p className="text-sm text-foreground/70">
                {t("employee.schedule.subtitle")}
              </p>
            </div>
            <div className="text-right text-xs text-foreground/70">
              <span className="font-medium text-foreground">
                {t("employee.schedule.sections.weeklySchedule")}
              </span>
              <div>{weekRangeLabel}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                {t("employee.schedule.labels.weekOf")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {weekRangeLabel || "-"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                {t("employee.schedule.labels.shiftsScheduled")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {myWeekShifts.length}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-foreground/60">
                {t("employee.schedule.labels.totalHours")}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {Number.isNaN(Number(totalScheduledHours))
                  ? "0.0"
                  : totalScheduledHours}
              </p>
            </div>
          </div>
        </section>

        {errorMsg && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-foreground/70">
            {t("shared.state.loading")}
          </div>
        ) : (
          <>
            <section className="border border-border rounded-2xl bg-card shadow-sm p-5 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-foreground/50">
                    {t("employee.schedule.sections.availableDrops")}
                  </p>
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("employee.schedule.sections.availableDropsTitle")}
                  </h2>
                  <p className="text-sm text-foreground/70">
                    {t("employee.schedule.sections.availableDropsSubtitle")}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground/80">
                  {t("employee.schedule.labels.count", {
                    count: availableDrops.length,
                  })}
                </span>
              </div>
              {availableDrops.length === 0 ? (
                <p className="text-sm text-foreground/60">
                  {t("employee.schedule.sections.availableDropsEmpty")}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {availableDrops.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-border bg-background/80 px-4 py-4 text-sm shadow-sm"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {a.shift.role?.name ??
                                t("employee.schedule.labels.unassignedRole")}
                            </p>
                            <p className="text-xs text-foreground/70">
                              {formatDate(a.shift.start_ts, locale)} ·{" "}
                              {formatTimeRange(
                                a.shift.start_ts,
                                a.shift.end_ts,
                                locale,
                              )}
                            </p>
                            <p className="text-xs text-foreground/60">
                              {a.shift.location?.name ??
                                t("employee.schedule.labels.noLocation")}
                            </p>
                          </div>
                          <div className="text-right text-[11px] text-foreground/60">
                            {t("employee.schedule.labels.droppedBy")}
                            <div className="font-medium text-foreground">
                              {a.user?.full_name ?? t("shared.labels.unnamed")}
                            </div>
                          </div>
                        </div>
                        {a.drop_reason && (
                          <p className="text-xs text-foreground/70">
                            <span className="font-semibold">
                              {t("shared.labels.reason")}
                            </span>
                            : {a.drop_reason}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => openPickupModal(a)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700"
                        >
                          {t("employee.schedule.buttons.requestPickup")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="border border-border rounded-2xl bg-card shadow-sm p-5 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-foreground/50">
                    {t("employee.schedule.sections.myDropped")}
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("employee.schedule.sections.myDroppedTitle")}
                  </h3>
                </div>
                {myDropped.length === 0 ? (
                  <p className="text-sm text-foreground/60">
                    {t("employee.schedule.sections.myDroppedEmpty")}
                  </p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {myDropped.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl border border-border bg-background/70 px-3 py-2"
                      >
                        <p className="font-semibold text-foreground">
                          {d.shift.role?.name ??
                            t("employee.schedule.labels.unassignedRole")}
                        </p>
                        <p className="text-xs text-foreground/70">
                          {formatDate(d.shift.start_ts, locale)} ·{" "}
                          {formatTimeRange(d.shift.start_ts, d.shift.end_ts, locale)} ·{" "}
                          {d.shift.location?.name ??
                            t("employee.schedule.labels.noLocation")}
                        </p>
                        {d.drop_reason && (
                          <p className="text-xs text-foreground/70">
                            {t("shared.labels.reason")}: {d.drop_reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-border rounded-2xl bg-card shadow-sm p-5 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-foreground/50">
                    {t("employee.schedule.sections.myPickupRequests")}
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("employee.schedule.sections.myPickupRequestsTitle")}
                  </h3>
                </div>
                {myPickupRequests.length === 0 ? (
                  <p className="text-sm text-foreground/60">
                    {t("employee.schedule.sections.myPickupRequestsEmpty")}
                  </p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {myPickupRequests.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-border bg-background/70 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">
                              {r.assignment.shift.role?.name ??
                                t("employee.schedule.labels.unassignedRole")}
                            </p>
                            <p className="text-xs text-foreground/70">
                              {formatDate(r.assignment.shift.start_ts, locale)} ·{" "}
                              {formatTimeRange(
                                r.assignment.shift.start_ts,
                                r.assignment.shift.end_ts,
                                locale
                              )}{" "}
                              · {r.assignment.shift.location?.name ??
                                t("employee.schedule.labels.noLocation")}
                            </p>
                            {r.reason && (
                              <p className="text-xs text-foreground/70">
                                {t("employee.schedule.labels.yourMessage")}:{" "}
                                {r.reason}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0">
                            {renderStatusBadge(r.status)}
                          </div>
                        </div>
                        <p className="text-[11px] text-foreground/60 mt-1">
                          {t("employee.schedule.labels.currentAssignee")}:{" "}
                          {r.assignment.user?.full_name ?? t("shared.labels.unnamed")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="border border-border rounded-2xl bg-card shadow-sm p-5 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-foreground/50">
                    {t("employee.schedule.sections.weeklySchedule")}
                  </p>
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("employee.schedule.sections.weeklyScheduleTitle")}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground/60">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                    {t("employee.schedule.labels.legendScheduled")}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-border px-2 py-0.5 font-medium text-foreground/70">
                    {t("employee.schedule.labels.legendEmpty")}
                  </span>
                </div>
              </div>

              {weekShifts.length === 0 || !myId ? (
                <p className="text-sm text-foreground/60">
                  {t("employee.schedule.sections.scheduleEmpty")}
                </p>
              ) : (
                <div className="rounded-2xl border border-border bg-background shadow-sm overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className="grid grid-cols-[minmax(220px,0.9fr)_repeat(7,minmax(90px,1fr))] border-b border-border bg-border text-xs font-semibold text-foreground/70 rounded-t-2xl">
                      <div className="px-4 py-2 flex items-center justify-between">
                        <span>{t("employee.schedule.columns.employee")}</span>
                        <span className="text-[11px] text-foreground/60">
                          {t("employee.schedule.columns.role")}
                        </span>
                      </div>
                      {weekDays.map((d) => (
                        <div
                          key={d.ymd}
                          className="px-3 py-2 border-l border-border text-left"
                        >
                          <span className="text-[11px] font-semibold text-foreground">
                            {d.label}
                          </span>
                          <span className="block text-[11px] text-foreground/70">
                            {d.dateLabel}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-[minmax(220px,0.9fr)_repeat(7,minmax(90px,1fr))] text-xs">
                      <div className="px-4 py-3 flex flex-col justify-center gap-0.5">
                        <span className="text-sm font-semibold text-foreground">
                          {userFullName ?? user?.email ?? t("shared.labels.you")}
                        </span>
                        <span className="text-[11px] text-foreground/60">
                          {t("employee.schedule.labels.mySchedule")}
                        </span>
                        <span className="text-[11px] text-foreground/60">
                          {primaryRoleName ??
                            t("employee.schedule.labels.unassignedRole")}
                        </span>
                      </div>

                      {weekDays.map((day) => {
                        const shiftsForDay = weekShifts.filter((s) => {
                          const hasMe = s.assignments.some((a) => getAssignmentUserId(a) === myId);
                          if (!hasMe) return false;
                          return toYmd(s.start_ts) === day.ymd;
                        });

                        if (shiftsForDay.length === 0) {
                          return (
                            <div
                              key={day.ymd}
                              className="px-3 py-3 border-t border-l border-border text-xs text-foreground/60"
                            >
                              <div className="rounded-lg border border-dashed border-border/70 bg-background px-3 py-2 text-center">
                                {t("employee.schedule.labels.noShift")}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={day.ymd}
                            className="px-3 py-3 border-t border-l border-border text-xs space-y-2"
                          >
                            {shiftsForDay.map((s) => (
                              <div
                                key={s.id}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 shadow-sm dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-100"
                              >
                                <p className="text-sm font-semibold">
                                  {formatTimeRange(s.start_ts, s.end_ts, locale)}
                                </p>
                                <p className="text-[11px] uppercase tracking-wide text-blue-900/70 dark:text-blue-200">
                                  {s.role?.name ??
                                    t("employee.schedule.labels.shiftFallback")}
                                </p>
                                <p className="text-[11px] text-blue-900/70 dark:text-blue-200/80">
                                  {s.location?.name ??
                                    t("employee.schedule.labels.noLocation")}
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {pickupModalOpen && selectedAssignment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("employee.schedule.pickup.modalTitle")}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setPickupModalOpen(false);
                    setSelectedAssignment(null);
                  }}
                  className="text-foreground/60 hover:text-foreground"
                >
                  ×
                </button>
              </div>
              <div className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-foreground/80">
                <p className="font-semibold text-foreground">
                  {selectedAssignment.shift.role?.name ??
                    t("employee.schedule.labels.unassignedRole")}
                </p>
                <p>
                  {formatDate(selectedAssignment.shift.start_ts, locale)} ·{" "}
                  {formatTimeRange(
                    selectedAssignment.shift.start_ts,
                    selectedAssignment.shift.end_ts,
                    locale,
                  )}{" "}
                  · {selectedAssignment.shift.location?.name ??
                    t("employee.schedule.labels.noLocation")}
                </p>
              </div>
              <textarea
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                rows={4}
                placeholder={t("employee.schedule.pickup.reasonPlaceholder")}
                value={pickupReason}
                onChange={(e) => setPickupReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickupModalOpen(false);
                    setSelectedAssignment(null);
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-background/60"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={submitPickupRequest}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  {t("employee.schedule.buttons.submitPickup")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

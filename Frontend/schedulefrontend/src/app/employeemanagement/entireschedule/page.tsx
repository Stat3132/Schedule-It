"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createAnnouncement } from "../../../lib/announcements";
import type { User } from "@supabase/supabase-js";

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
  user: BasicUser | null; // employee who dropped it
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
    user: BasicUser | null; // current owner of the shift
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

/* ---------- Date helpers ---------- */

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
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

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(
    undefined,
    opts
  )}`;
}

function toYmd(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/* ---------- Page ---------- */

export default function EmployeeSchedulePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [businessId, setBusinessId] = useState<UUID | null>(null);

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
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      const dateLabel = d.toLocaleDateString(undefined, {
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
  }, []);

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
        setErrorMsg("You do not have an active employment yet.");
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
        // eslint-disable-next-line no-console
        console.debug("loaded weekShifts:", scheduleRes.data);
      } catch (e) {
        // ignore
      }
    } catch (err: unknown) {
      console.error("Error loading employee schedule page:", err);
      if (err instanceof Error) setErrorMsg(err.message ?? "Failed to load schedule.");
      else setErrorMsg(String(err ?? "Failed to load schedule."));
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
          const sender = userFullName ?? user.email ?? "Employee";
          const title = `${sender} requested to pick up a shift`;
          const content = `${formatDate(selectedAssignment.shift.start_ts)} · ${formatTimeRange(
            selectedAssignment.shift.start_ts,
            selectedAssignment.shift.end_ts
          )}${selectedAssignment.shift.location?.name ? ` \n\nLocation: ${selectedAssignment.shift.location.name}` : ""}${pickupReason ? `\n\nReason: ${pickupReason}` : ""}`;
          await createAnnouncement(supabase, user.id, title, content, []);
        } catch (e) {
          console.error("Failed to create announcement for pickup request:", e);
        }

      setPickupModalOpen(false);
      setSelectedAssignment(null);
      setPickupReason("");
      void refreshAll();
    } catch (err: unknown) {
      console.error("Error creating pickup request:", err);
      if (err instanceof Error) setErrorMsg(err.message ?? "Failed to submit pickup request.");
      else setErrorMsg(String(err ?? "Failed to submit pickup request."));
    }
  };

  /* ----- Render helpers ----- */

  const renderStatusBadge = (status: string) => {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
    switch (status) {
      case "pending":
        return <span className={`${base} bg-amber-100 text-amber-800`}>Pending</span>;
      case "approved":
        return (
          <span className={`${base} bg-emerald-100 text-emerald-800`}>Approved</span>
        );
      case "denied":
        return <span className={`${base} bg-rose-100 text-rose-800`}>Denied</span>;
      case "canceled":
        return <span className={`${base} bg-gray-100 text-gray-700`}>Canceled</span>;
      default:
        return (
          <span className={`${base} bg-gray-100 text-gray-700`}>{status}</span>
        );
    }
  };

  const myId = user?.id ?? null;

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
    <div className="p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Schedule</h1>
          <p className="text-sm text-muted-foreground">
            View dropped shifts, pickup requests, and this week&apos;s schedule.
          </p>
        </div>
      </header>

      {errorMsg && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* Top: Available dropped shifts */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Available dropped shifts</h2>
            {availableDrops.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No dropped shifts available to pick up this week.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {availableDrops.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-sm flex flex-col gap-1"
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {a.shift.role?.name ?? "Unassigned role"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(a.shift.start_ts)} ·{" "}
                          {formatTimeRange(a.shift.start_ts, a.shift.end_ts)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.shift.location?.name ?? "No location"}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        Dropped by
                        <br />
                        <span className="font-medium">
                          {a.user?.full_name ?? "Unnamed"}
                        </span>
                      </div>
                    </div>
                    {a.drop_reason && (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        <span className="font-semibold">Reason: </span>
                        {a.drop_reason}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openPickupModal(a)}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        Request pickup
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Middle: My shift changes */}
          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold mb-2">Shifts I dropped</h3>
              {myDropped.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t dropped any shifts this week.
                </p>
              ) : (
                  <div className="space-y-2 text-sm">
                  {myDropped.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-border bg-background px-3 py-2 flex flex-col gap-0.5"
                    >
                      <div className="font-medium">
                        {d.shift.role?.name ?? "Unassigned role"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(d.shift.start_ts)} ·{" "}
                        {formatTimeRange(d.shift.start_ts, d.shift.end_ts)} ·{" "}
                        {d.shift.location?.name ?? "No location"}
                      </div>
                      {d.drop_reason && (
                        <div className="text-xs text-muted-foreground">
                          Reason: {d.drop_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Pickup requests I’ve made</h3>
              {myPickupRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t requested to pick up any shifts yet.
                </p>
              ) : (
                  <div className="space-y-2 text-sm">
                  {myPickupRequests.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-border bg-background px-3 py-2 flex flex-col gap-0.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {r.assignment.shift.role?.name ?? "Unassigned role"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(r.assignment.shift.start_ts)} ·{" "}
                            {formatTimeRange(
                              r.assignment.shift.start_ts,
                              r.assignment.shift.end_ts
                            )}{" "}
                            · {r.assignment.shift.location?.name ?? "No location"}
                          </div>
                          {r.reason && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Your message: {r.reason}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          {renderStatusBadge(r.status)}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        Current assignee:{" "}
                        {r.assignment.user?.full_name ?? "Unnamed"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Bottom: Weekly schedule grid (like your screenshot) */}
          <section>
            <h2 className="text-lg font-semibold mb-3">This week&apos;s schedule</h2>

            {weekShifts.length === 0 || !myId ? (
              <p className="text-sm text-muted-foreground">
                No published shifts for this week.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <div className="min-w-[900px] rounded-lg border border-border bg-background text-sm">
                  {/* Header row */}
                  <div className="grid grid-cols-[220px,120px,repeat(7,minmax(0,1fr))] border-b bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <div className="px-4 py-2">Employee</div>
                    <div className="px-4 py-2 border-l">Role</div>
                    {weekDays.map((d) => (
                      <div
                        key={d.ymd}
                        className="px-4 py-2 border-l text-center space-y-0.5"
                      >
                        <div>{d.label}</div>
                        <div className="text-[11px] font-normal">{d.dateLabel}</div>
                      </div>
                    ))}
                  </div>

                  {/* Single row: this employee */}
                  <div className="grid grid-cols-[220px,120px,repeat(7,minmax(0,1fr))]">
                    {/* Employee cell */}
                    <div className="px-4 py-3 border-r">
                      <div className="font-medium">
                        {userFullName ?? user?.email ?? "You"}
                      </div>
                      <div className="text-xs text-muted-foreground">My schedule</div>
                    </div>

                    {/* Role cell (primary role this week, if any) */}
                    <div className="px-4 py-3 border-r text-sm text-muted-foreground">
                      {(() => {
                          const firstWithMe = weekShifts.find((s) =>
                            s.assignments.some((a) => {
                              const raw = (a as any).user ?? (a as any).user_id ?? (a as any).userId;
                              if (!raw) return false;
                              if (typeof raw === "string") return raw === myId;
                              if (typeof raw === "object") return ((raw as any).id ?? raw) === myId;
                              return false;
                            })
                          );
                          return firstWithMe?.role?.name ?? "—";
                        })()}
                    </div>

                    {/* Day cells */}
                    {weekDays.map((day) => {
                      const shiftsForDay = weekShifts.filter((s) => {
                        const hasMe = s.assignments.some((a) => {
                          const raw = (a as any).user ?? (a as any).user_id ?? (a as any).userId;
                          if (!raw) return false;
                          if (typeof raw === "string") return raw === myId;
                          if (typeof raw === "object") return ((raw as any).id ?? raw) === myId;
                          return false;
                        });
                        if (!hasMe) return false;
                        return toYmd(s.start_ts) === day.ymd;
                      });

                      if (shiftsForDay.length === 0) {
                        return (
                          <div
                            key={day.ymd}
                            className="px-4 py-3 border-l text-xs text-muted-foreground align-top"
                          >
                            <div className="rounded-md bg-muted/40 px-3 py-2 text-center">
                              No shift
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={day.ymd}
                          className="px-4 py-3 border-l text-xs align-top space-y-2"
                        >
                          {shiftsForDay.map((s) => (
                            <div
                              key={s.id}
                              className="rounded-md border border-border bg-background/60 px-3 py-2 text-foreground shadow-sm"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-wide">
                                {s.role?.name ?? "Shift"}
                              </div>
                              <div className="text-xs">
                                {formatTimeRange(s.start_ts, s.end_ts)}
                              </div>
                              <div className="text-[11px] text-blue-900/80">
                                {s.location?.name ?? "No location"}
                              </div>
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

      {/* Modal for pickup reason */}
      {pickupModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-background p-4 shadow-lg">
            <h3 className="text-lg font-semibold">Request to pick up shift</h3>
            <div className="text-sm text-muted-foreground">
              <div className="font-medium">
                {selectedAssignment.shift.role?.name ?? "Unassigned role"}
              </div>
              <div>
                {formatDate(selectedAssignment.shift.start_ts)} ·{" "}
                {formatTimeRange(
                  selectedAssignment.shift.start_ts,
                  selectedAssignment.shift.end_ts
                )}{" "}
                · {selectedAssignment.shift.location?.name ?? "No location"}
              </div>
            </div>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={4}
              placeholder="Why do you want to pick up this shift?"
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
                className="rounded-md border px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPickupRequest}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Submit request
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
    </div>
  );
}

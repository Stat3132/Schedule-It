// app/employermanagement/droppedshifts/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AlertTriangle, Check, X, Clock } from "lucide-react";

type BusinessOpt = { id: string; name: string | null };
type LocationOpt = { id: string; name: string | null };

type EmploymentRow = {
  business_id: string;
  is_manager: boolean | null;
  is_admin: boolean | null;
  status: string | null;
};

type ShiftRow = {
  id: string;
  business_id: string | null;
  location_id: string | null;
  role_id: string | null;
  start_ts: string;
  end_ts: string;
  status: "draft" | "published" | "canceled";
};

type AssignmentRow = {
  id: string;
  shift_id: string;
  user_id: string;
  status: "assigned" | "offered" | "accepted" | "declined" | "dropped";
  drop_reason?: string | null;
  responded_at?: string | null;
};

type PickupRow = {
  id: string;
  shift_assignment_id: string;
  requester_user_id: string;
  reason: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name?: string | null;
  email?: string | null;
};

type RoleRow = { id: string; name: string | null };
type LocationRow = { id: string; name: string | null };

type DropRequest = {
  assignmentId: string;
  shiftId: string;
  dropperId: string;
  dropperName: string;
  pickerId: string | null;
  pickerName: string | null;
  pickerStatus: "pending" | "approved" | "denied" | "canceled" | null;
  roleName: string;
  locationName: string;
  start_ts: string;
  end_ts: string;
  drop_reason: string;
  pickup_reason: string | null;
  requested_at: string | null;
};

function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(d.getDate() - diff);
  return out;
}

function endOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const s = startOfWeek(d, weekStartsOn);
  const out = new Date(s);
  out.setDate(s.getDate() + 7);
  out.setMilliseconds(-1);
  return out;
}

function fmtDateTime(iso: string) {
  const dt = new Date(iso);
  return dt.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ManageDroppedShiftsPage() {
  const supabase = useRef(createClientComponentClient()).current;

  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);

  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | "ALL">("ALL");

  const [weekLabel, setWeekLabel] = useState("");
  const [requests, setRequests] = useState<DropRequest[]>([]);

  // Restore last-selected business/location from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBiz = localStorage.getItem("activeBusinessId");
    const storedLocRaw = localStorage.getItem("activeLocationIds");
    const locs = storedLocRaw ? (JSON.parse(storedLocRaw) as string[]) : [];

    if (storedBiz) setSelectedBiz(storedBiz);
    if (locs[0]) setSelectedLoc(locs[0]);
  }, []);

  // Load businesses user manages/owns
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setErrorMsg("No session found.");
          setLoading(false);
        }
        return;
      }

      const { data: empRows } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("status", "active")
        .or("is_manager.eq.true,is_admin.eq.true");

      const mgrBizIds = Array.from(
        new Set(
          (empRows ?? [])
            .filter((e: EmploymentRow) => e.is_manager || e.is_admin)
            .map((e: EmploymentRow) => e.business_id),
        ),
      );

      const { data: ownedRows } = await supabase
        .from("business")
        .select("id,name")
        .eq("owner_user_id", user.id);

      const named: BusinessOpt[] = (ownedRows ?? []) as BusinessOpt[];

      const idSet = new Set([...mgrBizIds, ...named.map((b) => b.id)]);
      const bizIds = Array.from(idSet);

      const missing = bizIds.filter((id) => !named.find((b) => b.id === id));
      let extra: BusinessOpt[] = [];
      if (missing.length) {
        const { data: bRows2 } = await supabase
          .from("business")
          .select("id,name")
          .in("id", missing);

        extra = (bRows2 ?? []) as BusinessOpt[];
      }

      const merged = [...named, ...extra];

      if (!cancelled) {
        setBusinesses(merged);
        setSelectedBiz((prev) => prev ?? merged[0]?.id ?? null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Persist selected business
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBiz) {
      localStorage.setItem("activeBusinessId", selectedBiz);
    }
  }, [selectedBiz]);

  // Persist selected location
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedLoc && selectedLoc !== "ALL") {
      localStorage.setItem("activeLocationIds", JSON.stringify([selectedLoc]));
    } else {
      localStorage.removeItem("activeLocationIds");
    }
  }, [selectedLoc]);

  // Load locations for selected business
  useEffect(() => {
    if (!selectedBiz) {
      setLocations([]);
      setSelectedLoc("ALL");
      return;
    }
    supabase
      .from("location")
      .select("id,name")
      .eq("business_id", selectedBiz)
      .then(({ data }) => {
        setLocations((data ?? []) as LocationOpt[]);
        setSelectedLoc((prev) => {
          if (prev === "ALL") return prev;
          const exists = (data ?? []).some((l) => l.id === prev);
          return exists ? prev : "ALL";
        });
      });
  }, [selectedBiz, supabase]);

  const scopeKey = useMemo(
    () => `${selectedBiz ?? ""}|${selectedLoc}`,
    [selectedBiz, selectedLoc],
  );

  const selectedLocName = useMemo(() => {
    if (selectedLoc === "ALL") return null;
    return locations.find((loc) => loc.id === selectedLoc)?.name ?? null;
  }, [locations, selectedLoc]);

  // Load dropped shifts + pickup requests for the week
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setRequests([]);

      if (!selectedBiz) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const ws = startOfWeek(now, 0);
      const we = endOfWeek(now, 0);
      const header = `Week of ${ws.toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })} - ${new Date(
        ws.getFullYear(),
        ws.getMonth(),
        ws.getDate() + 6,
      ).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;

      // 1) shifts in this business/location/week
      let shiftQ = supabase
        .from("shift")
        .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
        .eq("business_id", selectedBiz)
        .neq("status", "canceled")
        .gte("start_ts", ws.toISOString())
        .lt("start_ts", we.toISOString());

      if (selectedLoc !== "ALL") shiftQ = shiftQ.eq("location_id", selectedLoc);

      const { data: shiftRows } = await shiftQ;
      const shifts = (shiftRows ?? []) as ShiftRow[];
      const shiftIds = shifts.map((s) => s.id);

      if (!shiftIds.length) {
        if (!cancelled) {
          setRequests([]);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }

      // 2) dropped assignments for those shifts
      const { data: assignRows } = await supabase
        .from("shift_assignment")
        .select("id,shift_id,user_id,status,drop_reason,responded_at")
        .in("shift_id", shiftIds)
        .eq("status", "dropped");

      const assigns = (assignRows ?? []) as AssignmentRow[];
      if (!assigns.length) {
        if (!cancelled) {
          setRequests([]);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }

      const assignmentIds = assigns.map((a) => a.id);

      // 3) pickup requests for those dropped assignments
      const { data: pickupRows } = await supabase
        .from("shift_pickup_request")
        .select(
          "id,shift_assignment_id,requester_user_id,reason,status,created_at",
        )
        .in("shift_assignment_id", assignmentIds);

      const pickups = (pickupRows ?? []) as PickupRow[];

      // 4) pre-load related names
      const userIds = Array.from(
        new Set([
          ...assigns.map((a) => a.user_id),
          ...pickups.map((p) => p.requester_user_id),
        ]),
      );

      const roleIds = Array.from(
        new Set(
          shifts.map((s) => s.role_id).filter(Boolean) as string[],
        ),
      );
      const locIds = Array.from(
        new Set(
          shifts.map((s) => s.location_id).filter(Boolean) as string[],
        ),
      );

      const { data: profRows } = await supabase
        .from("profiles")
        .select("id,full_name,display_name,email")
        .in("id", userIds);

      const nameById = new Map(
        (profRows ?? []).map((p: ProfileRow) => [
          p.id,
          p.full_name || p.display_name || p.email || "Unnamed",
        ]),
      );

      const { data: roleRows } = await supabase
        .from("role")
        .select("id,name")
        .in("id", roleIds);

      const roleById = new Map(
        (roleRows ?? []).map((r: RoleRow) => [r.id, r.name ?? "Role"]),
      );

      const { data: locRows } = await supabase
        .from("location")
        .select("id,name")
        .in("id", locIds);

      const locById = new Map(
        (locRows ?? []).map((l: LocationRow) => [
          l.id,
          l.name ?? "Location",
        ]),
      );

      const shiftById = new Map(shifts.map((s) => [s.id, s]));

      // For each assignment, pick the most recent pickup request (if any)
      const pickupByAssignment = new Map<string, PickupRow>();
      pickups.forEach((p) => {
        const existing = pickupByAssignment.get(p.shift_assignment_id);
        if (!existing || p.created_at > existing.created_at) {
          pickupByAssignment.set(p.shift_assignment_id, p);
        }
      });

      const final: DropRequest[] = assigns.map((a) => {
        const sh = shiftById.get(a.shift_id)!;
        const pickup = pickupByAssignment.get(a.id) ?? null;

        return {
          assignmentId: a.id,
          shiftId: a.shift_id,
          dropperId: a.user_id,
          dropperName: nameById.get(a.user_id) ?? "Unknown",
          pickerId: pickup?.requester_user_id ?? null,
          pickerName: pickup
            ? nameById.get(pickup.requester_user_id) ?? "Unknown"
            : null,
          pickerStatus: pickup?.status ?? null,
          roleName: sh.role_id
            ? roleById.get(sh.role_id) ?? "Role"
            : "Role",
          locationName: sh.location_id
            ? locById.get(sh.location_id) ?? "Location"
            : "Location",
          start_ts: sh.start_ts,
          end_ts: sh.end_ts,
          drop_reason: a.drop_reason ?? "",
          pickup_reason: pickup?.reason ?? null,
          requested_at: pickup?.created_at ?? null,
        };
      });

      final.sort((a, b) => a.start_ts.localeCompare(b.start_ts));

      if (!cancelled) {
        setRequests(final);
        setWeekLabel(header);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scopeKey, supabase, selectedBiz, selectedLoc]);

  const bizName = useMemo(() => {
    const found = businesses.find((b) => b.id === selectedBiz);
    return found?.name ?? (selectedBiz ? selectedBiz.slice(0, 8) + "…" : "");
  }, [businesses, selectedBiz]);

  // Approve: mark pickup request as approved, reassign shift to requester, and
  // close out original assignment.
  const handleApprove = async (assignmentId: string) => {
    setBusyActionId(assignmentId);
    setErrorMsg(null);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setErrorMsg("Unable to load current user.");
        return;
      }
      const managerId = user.id;

      // Load the original assignment
      const { data: assignment, error: aErr } = await supabase
        .from("shift_assignment")
        .select("id,shift_id,user_id")
        .eq("id", assignmentId)
        .single();

      if (aErr || !assignment) {
        setErrorMsg("Original assignment not found.");
        return;
      }

      // Load the latest pending pickup request for this assignment
      const { data: pickup, error: pErr } = await supabase
        .from("shift_pickup_request")
        .select("id,requester_user_id,status")
        .eq("shift_assignment_id", assignmentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pErr || !pickup || pickup.status !== "pending") {
        setErrorMsg("No pending pickup request found for this shift.");
        return;
      }

      const nowIso = new Date().toISOString();
      const shiftId: string = assignment.shift_id;
      const pickerId: string = pickup.requester_user_id;

      // Ensure the picker has an assignment row for this shift with source 'swap'
      const { data: existingNew, error: exErr } = await supabase
        .from("shift_assignment")
        .select("id,status")
        .eq("shift_id", shiftId)
        .eq("user_id", pickerId)
        .maybeSingle();

      if (exErr) {
        setErrorMsg(`Error checking existing assignment: ${exErr.message}`);
        return;
      }

      if (existingNew) {
        // Update existing assignment for picker
        const { error: updNewErr } = await supabase
          .from("shift_assignment")
          .update({
            status: "assigned",
            source: "swap",
            assigned_by: managerId,
            responded_at: nowIso,
          })
          .eq("id", existingNew.id);

        if (updNewErr) {
          setErrorMsg(`Failed to update pickup assignment: ${updNewErr.message}`);
          return;
        }
      } else {
        // Insert new assignment for picker
        const { error: insErr } = await supabase.from("shift_assignment").insert({
          shift_id: shiftId,
          user_id: pickerId,
          assigned_by: managerId,
          status: "assigned",
          source: "swap",
          responded_at: nowIso,
        });

        if (insErr) {
          setErrorMsg(`Failed to create pickup assignment: ${insErr.message}`);
          return;
        }
      }

      // Mark the original assignment as declined (no longer active)
      const { error: updOrigErr } = await supabase
        .from("shift_assignment")
        .update({
          status: "declined",
          responded_at: nowIso,
        })
        .eq("id", assignmentId);

      if (updOrigErr) {
        setErrorMsg(`Failed to close original assignment: ${updOrigErr.message}`);
        return;
      }

      // Mark pickup request as approved
      const { error: updPickupErr } = await supabase
        .from("shift_pickup_request")
        .update({
          status: "approved",
          decided_by: managerId,
          decided_at: nowIso,
        })
        .eq("id", pickup.id);

      if (updPickupErr) {
        setErrorMsg(`Failed to update pickup request: ${updPickupErr.message}`);
        return;
      }

      // Remove the row from list
      setRequests((prev) =>
        prev.filter((r) => r.assignmentId !== assignmentId),
      );
    } catch (e) {
      if (e instanceof Error) setErrorMsg(`Approve failed: ${e.message}`);
      else setErrorMsg("Approve failed.");
    } finally {
      setBusyActionId(null);
    }
  };

  // Deny: keep original assignment, mark pickup request as denied
  const handleDeny = async (assignmentId: string) => {
    setBusyActionId(assignmentId);
    setErrorMsg(null);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setErrorMsg("Unable to load current user.");
        return;
      }
      const managerId = user.id;
      const nowIso = new Date().toISOString();

      // Reset original assignment back to assigned
      const { error: updAssignErr } = await supabase
        .from("shift_assignment")
        .update({
          status: "assigned",
          responded_at: nowIso,
        })
        .eq("id", assignmentId);

      if (updAssignErr) {
        setErrorMsg(`Deny failed (assignment): ${updAssignErr.message}`);
        return;
      }

      // Mark latest pickup request as denied, if any
      const { data: pickup, error: pErr } = await supabase
        .from("shift_pickup_request")
        .select("id,status")
        .eq("shift_assignment_id", assignmentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pErr && pickup && pickup.status === "pending") {
        const { error: updPickupErr } = await supabase
          .from("shift_pickup_request")
          .update({
            status: "denied",
            decided_by: managerId,
            decided_at: nowIso,
          })
          .eq("id", pickup.id);

        if (updPickupErr) {
          setErrorMsg(`Deny failed (pickup): ${updPickupErr.message}`);
          return;
        }
      }

      setRequests((prev) =>
        prev.filter((r) => r.assignmentId !== assignmentId),
      );
    } catch (e) {
      if (e instanceof Error) setErrorMsg(`Deny failed: ${e.message}`);
      else setErrorMsg("Deny failed.");
    } finally {
      setBusyActionId(null);
    }
  };

  if (loading && !businesses.length) {
    return <div className="p-6">Loading…</div>;
  }

  if (!businesses.length) {
    return (
      <div className="p-6">
        No manager access found for your user.
        <div className="mt-2 text-sm text-foreground/70">
          Ensure you either own a business or have an active employment with
          manager/admin rights.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500 dark:text-amber-300" />
              Dropped Shifts
            </h1>
            <p className="text-foreground/70 mt-1">
              {bizName} ·{" "}
              {selectedLoc === "ALL"
                ? "All locations"
                : selectedLocName ?? "One location"}
            </p>
            <p className="text-foreground/70">{weekLabel}</p>
            {errorMsg && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{errorMsg}</p>
            )}
          </div>
        </div>

        <div className="bg-background rounded-xl shadow-sm border border-border">
          {loading ? (
            <div className="p-6 text-sm text-foreground/70 flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-foreground/60 dark:text-foreground/40" /> Loading dropped
              shifts…
            </div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-sm text-foreground/70">
              No dropped shift requests for this week and scope.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li
                  key={r.assignmentId}
                  className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {r.roleName}
                      </span>
                      <span className="text-xs text-foreground/70">
                        · {r.locationName}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-foreground/70 flex flex-wrap gap-2 items-center">
                      <span>
                        {fmtDateTime(r.start_ts)} – {fmtDateTime(r.end_ts)}
                      </span>
                      {r.requested_at && (
                        <span className="text-foreground/70">
                          · Pickup requested: {fmtDateTime(r.requested_at)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-foreground/70 flex flex-col gap-1">
                      <div>
                        <span className="font-semibold">Dropped by:</span>{" "}
                        {r.dropperName}
                      </div>
                      <div>
                        <span className="font-semibold">Pickup by:</span>{" "}
                        {r.pickerName ?? "No pickup request yet"}
                        {r.pickerStatus && r.pickerName && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-foreground/70">
                            ({r.pickerStatus})
                          </span>
                        )}
                      </div>
                    </div>

                    {r.drop_reason && (
                      <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700">
                        <span className="font-medium">Drop reason: </span>
                        {r.drop_reason}
                      </div>
                    )}

                    {r.pickup_reason && (
                      <div className="mt-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">
                        <span className="font-medium">Pickup note: </span>
                        {r.pickup_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                    <button
                      type="button"
                      onClick={() => handleApprove(r.assignmentId)}
                      disabled={busyActionId === r.assignmentId}
                      className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 disabled:opacity-60"
                    >
                      <Check className="w-3 h-3 mr-1" /> Approve pickup
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeny(r.assignmentId)}
                      disabled={busyActionId === r.assignmentId}
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 disabled:opacity-60"
                    >
                      <X className="w-3 h-3 mr-1" /> Deny pickup
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

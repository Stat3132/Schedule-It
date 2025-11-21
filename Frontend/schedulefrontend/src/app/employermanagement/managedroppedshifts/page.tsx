"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  AlertTriangle,
  Check,
  X,
  Clock,
  Plus,
  CheckSquare,
  Bell,
  Users,
  Settings,
  LogOut,
} from "lucide-react";

/* ---------- Types ---------- */
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
  employeeId: string;
  employeeName: string;
  roleName: string;
  locationName: string;
  start_ts: string;
  end_ts: string;
  drop_reason: string;
  requested_at: string | null;
};

/* ---------- Helpers ---------- */
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

/* ========================================================================== */
/*                      DROPPED SHIFTS MANAGEMENT PAGE                        */
/* ========================================================================== */

export default function ManageDroppedShiftsPage() {
  const supabase = useRef(createClientComponentClient()).current;
  const router = useRouter();

  /* ---------- State ---------- */
  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);

  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | "ALL">("ALL");

  const [weekLabel, setWeekLabel] = useState("");
  const [requests, setRequests] = useState<DropRequest[]>([]);

  /* ---------- Logout ---------- */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  /* ---------- LocalStorage Seeds ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBiz = localStorage.getItem("activeBusinessId");
    const storedLocRaw = localStorage.getItem("activeLocationIds");
    const locs = storedLocRaw ? (JSON.parse(storedLocRaw) as string[]) : [];

    if (storedBiz) setSelectedBiz(storedBiz);
    if (locs[0]) setSelectedLoc(locs[0]);
  }, []);

  /* ---------- Business Bootstrap ---------- */
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

      // Manager/admin through employment
      const { data: empRows } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("status", "active")
        .or("is_manager.eq.true,is_admin.eq.true");

      const mgrBizIds = Array.from(
        new Set(
          (empRows ?? [])
            .filter((e: EmploymentRow) => e.is_manager || e.is_admin)
            .map((e) => e.business_id),
        ),
      );

      // Owned businesses
      const { data: ownedRows } = await supabase
        .from("business")
        .select("id,name")
        .eq("owner_user_id", user.id);

      const named: BusinessOpt[] = (ownedRows ?? []).map((b) => ({
        id: b.id,
        name: b.name,
      }));

      const idSet = new Set([...mgrBizIds, ...named.map((b) => b.id)]);
      const bizIds = Array.from(idSet);

      // Fetch missing business names
      const missing = bizIds.filter((id) => !named.find((b) => b.id === id));
      let extra: BusinessOpt[] = [];
      if (missing.length) {
        const { data: bRows2 } = await supabase
          .from("business")
          .select("id,name")
          .in("id", missing);

        extra = (bRows2 ?? []).map((b) => ({
          id: b.id,
          name: b.name ?? null,
        }));
      }

      const merged = [...named, ...extra];

      if (!cancelled) {
        setBusinesses(merged);
        if (!selectedBiz && merged.length) setSelectedBiz(merged[0].id);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  /* ---------- Persist Biz/Loc Selection ---------- */
  useEffect(() => {
    if (!selectedBiz) return;
    if (typeof window !== "undefined")
      localStorage.setItem("activeBusinessId", selectedBiz);
  }, [selectedBiz]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedLoc !== "ALL") {
      localStorage.setItem("activeLocationIds", JSON.stringify([selectedLoc]));
    } else {
      localStorage.removeItem("activeLocationIds");
    }
  }, [selectedLoc]);

  /* ---------- Load Locations ---------- */
  useEffect(() => {
    if (!selectedBiz) return;

    supabase
      .from("location")
      .select("id,name")
      .eq("business_id", selectedBiz)
      .then(({ data }) => {
        setLocations((data ?? []) as LocationOpt[]);
        if (
          selectedLoc !== "ALL" &&
          !(data ?? []).find((l) => l.id === selectedLoc)
        ) {
          setSelectedLoc("ALL");
        }
      });
  }, [selectedBiz]);

  /* ---------- Key for scope ---------- */
  const scopeKey = useMemo(
    () => `${selectedBiz ?? ""}|${selectedLoc}`,
    [selectedBiz, selectedLoc],
  );

  /* ---------- Load Dropped Shift Requests ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setRequests([]);

      if (!selectedBiz) return;

      const now = new Date();
      const ws = startOfWeek(now);
      const we = endOfWeek(now);

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

      // Load shifts in this scope + week
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

      // Load dropped assignments
      const { data: assignRows } = await supabase
        .from("shift_assignment")
        .select("id,shift_id,user_id,status,drop_reason,responded_at")
        .in("shift_id", shiftIds)
        .eq("status", "dropped");

      const assigns = (assignRows ?? []) as AssignmentRow[];
      if (!assigns.length) {
        setRequests([]);
        setWeekLabel(header);
        setLoading(false);
        return;
      }

      const userIds = Array.from(new Set(assigns.map((a) => a.user_id)));
      const roleIds = Array.from(
        new Set(shifts.map((s) => s.role_id).filter(Boolean)),
      );
      const locIds = Array.from(
        new Set(shifts.map((s) => s.location_id).filter(Boolean)),
      );

      // Profiles
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

      // Roles
      const { data: roleRows } = await supabase
        .from("role")
        .select("id,name")
        .in("id", roleIds);

      const roleById = new Map(
        (roleRows ?? []).map((r: RoleRow) => [r.id, r.name ?? "Role"]),
      );

      // Locations
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

      const final: DropRequest[] = assigns.map((a) => {
        const sh = shiftById.get(a.shift_id)!;
        return {
          assignmentId: a.id,
          shiftId: a.shift_id,
          employeeId: a.user_id,
          employeeName: nameById.get(a.user_id) ?? "Unknown",
          roleName: sh.role_id
            ? roleById.get(sh.role_id) ?? "Role"
            : "Role",
          locationName: sh.location_id
            ? locById.get(sh.location_id) ?? "Location"
            : "Location",
          start_ts: sh.start_ts,
          end_ts: sh.end_ts,
          drop_reason: a.drop_reason ?? "",
          requested_at: a.responded_at ?? null,
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
  }, [scopeKey, supabase]);

  const bizName = useMemo(() => {
    const found = businesses.find((b) => b.id === selectedBiz);
    return found?.name ?? selectedBiz ?? "";
  }, [businesses, selectedBiz]);

  /* ---------- Approve / Deny Drop ---------- */
  const handleApprove = async (assignmentId: string) => {
    setBusyActionId(assignmentId);
    const { error } = await supabase
      .from("shift_assignment")
      .update({
        status: "declined", // remove from schedule
        responded_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);

    if (!error) {
      setRequests((prev) =>
        prev.filter((r) => r.assignmentId !== assignmentId),
      );
    } else {
      setErrorMsg("Approve failed: " + error.message);
    }
    setBusyActionId(null);
  };

  const handleDeny = async (assignmentId: string) => {
    setBusyActionId(assignmentId);
    const { error } = await supabase
      .from("shift_assignment")
      .update({
        status: "assigned", // restore shift
        responded_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);

    if (!error) {
      setRequests((prev) =>
        prev.filter((r) => r.assignmentId !== assignmentId),
      );
    } else {
      setErrorMsg("Deny failed: " + error.message);
    }
    setBusyActionId(null);
  };

  /* ====================================================================== */
  /*                                RENDER                                 */
  /* ====================================================================== */

  if (!businesses.length && !loading) {
    return (
      <div className="p-6">
        No manager access found.
        <div className="text-sm text-gray-600 mt-2">
          You must own a business or be assigned manager/admin.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ================================================================== */}
      {/*                          EMPLOYER NAV BAR                         */}
      {/* ================================================================== */}

      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Business + Location Selectors */}
            <div className="flex items-center gap-3">
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={selectedBiz ?? ""}
                onChange={(e) => setSelectedBiz(e.target.value || null)}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name ?? b.id}
                  </option>
                ))}
              </select>

              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={selectedLoc}
                onChange={(e) =>
                  setSelectedLoc((e.target.value as string) || "ALL")
                }
                disabled={!selectedBiz}
              >
                <option value="ALL">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? "Location"}
                  </option>
                ))}
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center space-x-1">
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() =>
                  router.push("/employermanagement/createschedule")
                }
              >
                <Plus className="w-4 h-4" /> Create Schedule
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() =>
                  router.push("/employermanagement/managetimerequests")
                }
              >
                <Clock className="w-4 h-4" /> Time Off Requests
              </button>

              {/* Availability Requests */}
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() =>
                  router.push("/employermanagement/availabilityrequest")
                }
              >
                <CheckSquare className="w-4 h-4" /> Availability Requests
              </button>

              {/* DROPPED SHIFTS — NEW BUTTON (THIS PAGE) */}
              <button
                className="px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" /> Dropped Shifts
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() =>
                  router.push("/employermanagement/announcements")
                }
              >
                <Bell className="w-4 h-4" /> Announcements
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() =>
                  router.push(
                    `/employermanagement/employeeinvitemanagement/${selectedBiz}`,
                  )
                }
              >
                <Users className="w-4 h-4" /> User Management
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employermanagement/settings")}
              >
                <Settings className="w-4 h-4" /> Settings
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ================================================================== */}
      {/*                               CONTENT                              */}
      {/* ================================================================== */}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Dropped Shifts
          </h1>
          <p className="text-gray-600">{bizName}</p>
          <p className="text-gray-600">{weekLabel}</p>
          {errorMsg && (
            <p className="text-sm text-red-600 mt-2">{errorMsg}</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          {loading ? (
            <div className="p-6 text-sm text-gray-600 flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin" />
              Loading dropped shifts…
            </div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No dropped shift requests for this week.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {requests.map((r) => (
                <li
                  key={r.assignmentId}
                  className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {r.employeeName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {r.roleName} · {r.locationName}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-gray-700">
                      {fmtDateTime(r.start_ts)} – {fmtDateTime(r.end_ts)}
                    </div>

                    {r.drop_reason && (
                      <div className="mt-2 text-xs bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
                        <span className="font-medium">Reason: </span>
                        {r.drop_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:items-end gap-2">
                    <button
                      onClick={() => handleApprove(r.assignmentId)}
                      disabled={busyActionId === r.assignmentId}
                      className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Approve Drop
                    </button>
                    <button
                      onClick={() => handleDeny(r.assignmentId)}
                      disabled={busyActionId === r.assignmentId}
                      className="bg-red-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-60 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Deny Drop
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

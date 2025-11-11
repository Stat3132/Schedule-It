"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Plus, Clock, CheckSquare, Bell, Users, Settings } from "lucide-react";

/* ---------- Types ---------- */
type EmploymentRow = {
  business_id: string;
  is_manager: boolean | null;
  is_admin: boolean | null;
  status: string | null;
  user_id?: string | null;
  location_id?: string | null;
};
type ShiftRow = {
  id: string;
  business_id: string;
  location_id: string | null;
  role_id: string | null;
  start_ts: string;
  end_ts: string;
  status: "draft" | "published" | "canceled";
};
type AssignmentRow = { id: string; shift_id: string; user_id: string; status: string };
type ProfileRow = { id: string; full_name: string | null };
type BusinessOpt = { id: string; name: string | null };
type LocationOpt = { id: string; name: string };
type DayCell = { start?: string; end?: string };
type GridRow = { userId: string; name: string; byDay: DayCell[] };

/* ---------- Date helpers ---------- */
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
function fmtDateMMDD(d: Date) {
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${mm}/${dd}`;
}

/* ---------- Component ---------- */
export default function EmployerHomePage() {
  const supabase = useRef(createClientComponentClient()).current;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);

  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | "ALL">("ALL");

  const [weekLabel, setWeekLabel] = useState("");
  const [days, setDays] = useState<{ label: string; date: string }[]>([]);
  const [grid, setGrid] = useState<GridRow[]>([]);

  /* ---------- Bootstrap: discover accessible businesses ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();
      if (uErr || !user) {
        if (!cancelled) {
          setLoading(false);
          setErrorMsg("No session. Please sign in.");
        }
        return;
      }

      // Manager/admin via employment
      const { data: empData, error: empError } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("status", "active")
        .or("is_manager.eq.true,is_admin.eq.true");
      if (empError) {
        if (!cancelled) {
          setLoading(false);
          setErrorMsg(`Employment bootstrap failed: ${empError.message}`);
        }
        return;
      }
      const mgrIds = Array.from(
        new Set(
          (empData ?? [])
            .filter((e: EmploymentRow) => e.is_manager || e.is_admin)
            .map((e: EmploymentRow) => e.business_id),
        ),
      );

      // Owned businesses
      const { data: ownedRows, error: ownedErr } = await supabase
        .from("business")
        .select("id,name")
        .eq("owner_user_id", user.id);
      if (ownedErr) {
        // Not fatal; managers still proceed
        console.warn("Owned business query error:", ownedErr.message);
      }
      const owned = (ownedRows ?? []) as { id: string; name: string | null }[];

      // Union of IDs then fetch names only for those IDs to avoid RLS denials
      const idSet = new Set<string>(mgrIds);
      for (const b of owned) idSet.add(b.id);
      const idList = Array.from(idSet);

      let named: BusinessOpt[] = owned.map((r) => ({ id: r.id, name: r.name }));
      const needNames = idList.filter((id) => !owned.find((o) => o.id === id));
      if (needNames.length) {
        // Try to read names for manager-visible businesses; may be allowed by your RLS
        const { data: bRows } = await supabase
          .from("business")
          .select("id,name")
          .in("id", needNames);
        const extra = (bRows ?? []).map((r: { id: string; name: string | null }) => ({
          id: r.id,
          name: r.name ?? null,
        }));
        const existingIds = new Set(named.map((x) => x.id));
        named = named.concat(extra.filter((e) => !existingIds.has(e.id)));
        // Fill any still-unnamed with placeholder
        for (const id of needNames) {
          if (!named.find((n) => n.id === id)) named.push({ id, name: null });
        }
      }

      if (!cancelled) {
        setBusinesses(named);
        if (!selectedBiz && idList.length > 0) setSelectedBiz(idList[0]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* ---------- Load locations when business changes ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedBiz) {
        setLocations([]);
        setSelectedLoc("ALL");
        return;
      }
      const { data, error } = await supabase
        .from("location")
        .select("id,name")
        .eq("business_id", selectedBiz);

      if (cancelled) return;
      if (error) {
        setErrorMsg(`Location query failed: ${error.message}`);
        setLocations([]);
        setSelectedLoc("ALL");
        return;
      }
      const locs = (data ?? []) as LocationOpt[];
      setLocations(locs);
      if (selectedLoc !== "ALL" && !locs.find((l) => l.id === selectedLoc)) {
        setSelectedLoc("ALL");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBiz, selectedLoc, supabase]);

  /* ---------- Load weekly grid ---------- */
  const scopeKey = useMemo(() => `${selectedBiz ?? ""}|${selectedLoc}`, [selectedBiz, selectedLoc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      setGrid([]);
      setDays([]);
      setWeekLabel("");

      if (!selectedBiz) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const ws = startOfWeek(now, 0);
      const we = endOfWeek(now, 0);

      const labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        return { label: d.toLocaleDateString([], { weekday: "long" }), date: fmtDateMMDD(d) };
      });
      const header = `Week of ${ws.toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })} - ${new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;

      // Employees in scope
      let empQ = supabase
        .from("employment")
        .select("user_id,location_id,status")
        .eq("business_id", selectedBiz)
        .eq("status", "active");
      if (selectedLoc !== "ALL") {
        empQ = empQ.or(`location_id.is.null,location_id.eq.${selectedLoc}`);
      }
      const { data: empRows, error: empErr } = await empQ;
      if (empErr) {
        if (!cancelled) {
          setErrorMsg(`Employment query failed: ${empErr.message}`);
          setDays(labels);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }
      const employeeIds = Array.from(
        new Set(
          (empRows ?? [])
            .map((e: { user_id?: string | null }) => e.user_id)
            .filter(Boolean) as string[],
        ),
      );

      // Profiles
      let nameById = new Map<string, string>();
      if (employeeIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", employeeIds);
        if (profErr) {
          if (!cancelled) {
            setErrorMsg(`Profile query failed: ${profErr.message}`);
            setDays(labels);
            setWeekLabel(header);
            setLoading(false);
          }
          return;
        }
        nameById = new Map<string, string>(
          (profs as ProfileRow[]).map((p) => [p.id, p.full_name ?? ""]),
        );
      }

      // Shifts
      let shiftQ = supabase
        .from("shift")
        .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
        .eq("business_id", selectedBiz)
        .eq("status", "published")
        .gte("start_ts", ws.toISOString())
        .lte("start_ts", we.toISOString());
      if (selectedLoc !== "ALL") shiftQ = shiftQ.eq("location_id", selectedLoc);
      const { data: shifts, error: shErr } = await shiftQ;
      if (shErr) {
        if (!cancelled) {
          setErrorMsg(`Shift query failed: ${shErr.message}`);
          setDays(labels);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }
      const safeShifts: ShiftRow[] = Array.isArray(shifts) ? (shifts as ShiftRow[]) : [];
      const shiftIds = safeShifts.map((s) => s.id);

      // Assignments
      let assigns: AssignmentRow[] = [];
      if (shiftIds.length && employeeIds.length) {
        const { data: assignsRaw, error: asErr } = await supabase
          .from("shift_assignment")
          .select("id,shift_id,user_id,status")
          .in("shift_id", shiftIds)
          .in("user_id", employeeIds);
        if (asErr) {
          if (!cancelled) {
            setErrorMsg(`Assignment query failed: ${asErr.message}`);
            setDays(labels);
            setWeekLabel(header);
            setLoading(false);
          }
          return;
        }
        assigns = (assignsRaw ?? []) as AssignmentRow[];
      }

      const byUser = new Map<string, GridRow>();
      for (const uid of employeeIds) {
        byUser.set(uid, {
          userId: uid,
          name: nameById.get(uid) ?? uid,
          byDay: Array.from({ length: 7 }, () => ({})),
        });
      }
      for (const a of assigns) {
        const sh = safeShifts.find((s) => s.id === a.shift_id);
        if (!sh) continue;
        const dow = new Date(sh.start_ts).getDay(); // 0..6 mapped to labels built from Sunday
        const rec = byUser.get(a.user_id);
        if (!rec) continue;
        rec.byDay[dow] = {
          start: new Date(sh.start_ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          end: new Date(sh.end_ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        };
      }

      if (!cancelled) {
        setDays(labels);
        setGrid(Array.from(byUser.values()));
        setWeekLabel(header);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeKey, supabase]);

  /* ---------- Derived ---------- */
  const bizName = useMemo(() => {
    const found = businesses.find((b) => b.id === selectedBiz);
    return found?.name ?? (selectedBiz ? selectedBiz.slice(0, 8) + "…" : "");
  }, [businesses, selectedBiz]);

  /* ---------- Early outs ---------- */
  if (loading && !businesses.length) return <div className="p-6">Loading…</div>;
  if (!businesses.length)
    return (
      <div className="p-6">
        No manager access found for your user.
        <div className="mt-2 text-sm text-gray-600">
          Ensure you either own a business or have an active employment with manager/admin rights.
        </div>
      </div>
    );

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              {/* Business selector */}
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

              {/* Location selector */}
              <select
                className="border rounded-md px-2 py-1 text-sm"
                value={selectedLoc}
                onChange={(e) => setSelectedLoc((e.target.value as string) || "ALL")}
                disabled={!selectedBiz}
              >
                <option value="ALL">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1">
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employermanagement/createschedule")}
              >
                <Plus className="w-4 h-4" /> Create Schedule
              </button>
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employermanagement/time-off")}
              >
                <Clock className="w-4 h-4" /> Time Off Requests
              </button>
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employermanagement/availability")}
              >
                <CheckSquare className="w-4 h-4" /> Availability Requests
              </button>
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employermanagement/announcements")}
              >
                <Bell className="w-4 h-4" /> Announcements
              </button>
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push(`/employermanagement/employeeinvitemanagement/${selectedBiz}`)}
              >
                <Users className="w-4 h-4" /> User Management
              </button>
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employermanagement/settings")}
              >
                <Settings className="w-4 h-4" /> Settings
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Weekly Schedule</h1>
          <p className="text-gray-600 mt-1">
            {bizName} · {selectedLoc === "ALL" ? "All locations" : "One location"}
          </p>
          <p className="text-gray-600">{weekLabel}</p>
          {errorMsg && <p className="text-sm text-red-600 mt-2">{errorMsg}</p>}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="p-6">Loading…</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-left">
                    <div className="text-sm font-semibold text-gray-900">Staff Member</div>
                    <div className="text-xs text-gray-500">
                      {selectedLoc === "ALL" ? "Business scope" : "Business + Location scope"}
                    </div>
                  </th>
                  {days.map((d) => (
                    <th key={d.label} className="px-4 py-4 text-center min-w-[140px]">
                      <div className="text-sm font-semibold text-gray-900">{d.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{d.date}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => (
                  <tr key={row.userId} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900">{row.name || row.userId}</div>
                    </td>
                    {row.byDay.map((cell, idx) => (
                      <td key={idx} className="px-4 py-4 text-center">
                        {cell.start ? (
                          <div className="border rounded-lg p-2">
                            <div className="text-xs font-semibold">{cell.start}</div>
                            <div className="text-xs">{cell.end}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 py-2">Off</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {grid.length === 0 && (
                  <tr>
                    <td className="px-6 py-8 text-sm text-gray-500" colSpan={1 + days.length}>
                      No employees or no published shifts for this scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

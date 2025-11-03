"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";

type EmploymentRow = { business_id: string; is_manager?: boolean; is_admin?: boolean; status?: string; user_id?: string; location_id?: string };
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Plus, Clock, CheckSquare, Bell, Users, Settings } from "lucide-react";

type ShiftRow = {
  id: string; business_id: string; location_id: string; role_id: string;
  start_ts: string; end_ts: string; status: "draft" | "published" | "canceled";
};
type AssignmentRow = { id: string; shift_id: string; user_id: string; status: string };
type ProfileRow = { id: string; full_name: string | null };
type BusinessOpt = { id: string; name?: string | null };
type LocationOpt = { id: string; name: string };
type DayCell = { start?: string; end?: string };
type GridRow = { userId: string; name: string; byDay: DayCell[] };

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

export default function EmployerHomePage() {
  const supabase = useRef(createClientComponentClient()).current;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);

  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | "ALL">("ALL");

  const [weekLabel, setWeekLabel] = useState("");
  const [days, setDays] = useState<{ label: string; date: string }[]>([]);
  const [grid, setGrid] = useState<GridRow[]>([]);

  // Bootstrap: discover businesses where user is owner or manager/admin.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // manager/admin via employment
      const emp = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("status", "active")
        .or("is_manager.eq.true,is_admin.eq.true");

  const mgrIds = Array.from(new Set(((emp.data ?? []) as EmploymentRow[]).map((e) => e.business_id)));

      // owned businesses (name may be readable only if owner due to RLS)
      const owned = await supabase.from("business").select("id,name");
      const ownedRows = (owned.data ?? []) as { id: string; name?: string | null }[];

      const idSet = new Set<string>(mgrIds);
      for (const b of ownedRows) idSet.add(b.id);

      const idList = Array.from(idSet);
      // Try to attach names where possible
      const byIdName = new Map(ownedRows.map((r) => [r.id, r.name ?? null]));
      const bizOpts: BusinessOpt[] = idList.map((id) => ({ id, name: byIdName.get(id) ?? null }));

      if (cancelled) return;
      setBusinesses(bizOpts);
      if (!selectedBiz && idList.length > 0) setSelectedBiz(idList[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]); // run once

  // Load locations for the selected business
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
  const locs = (data ?? []) as { id: string; name: string }[];
      setLocations(locs);
      // Keep selection if still valid
      if (selectedLoc !== "ALL" && !locs.find((l) => l.id === selectedLoc)) {
        setSelectedLoc("ALL");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBiz, supabase]);

  // Load weekly grid for the selected scope
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

      // Active employees in business (optionally restricted to location)
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

      const employeeIds = Array.from(new Set(((empRows ?? []) as { user_id?: string }[]).map((e) => e.user_id).filter(Boolean) as string[]));
      // Names
      const profsResp = employeeIds.length
        ? await supabase.from("profiles").select("id,full_name").in("id", employeeIds)
        : ({ data: [] as { id: string; full_name: string | null }[], error: null as PostgrestError | null });
      const profs = profsResp.data ?? [];
      const profErr = profsResp.error;

      if (profErr) {
        if (!cancelled) {
          setErrorMsg(`Profile query failed: ${profErr.message}`);
          setDays(labels);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }

      const nameById = new Map<string, string>((profs as ProfileRow[]).map((p) => [p.id, p.full_name ?? ""]));

      // Published shifts this week in scope
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

      // Assignments only for those shifts and our employees
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

      // Build grid: seed from employment, overlay assignments
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
        const dow = new Date(sh.start_ts).getDay();
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

  // UI helpers
  const bizName = useMemo(() => {
    const found = businesses.find((b) => b.id === selectedBiz);
    return found?.name ?? (selectedBiz ? selectedBiz.slice(0, 8) + "…" : "");
  }, [businesses, selectedBiz]);

  if (!businesses.length && loading) return <div className="p-6">Loading…</div>;
  if (!businesses.length) return <div className="p-6">No manager access found for your user.</div>;

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
              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create Schedule
              </button>
              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <Clock className="w-4 h-4" /> Time Off Requests
              </button>
              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <CheckSquare className="w-4 h-4" /> Availability Requests
              </button>
              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <Bell className="w-4 h-4" /> Announcements
              </button>
              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <Users className="w-4 h-4" /> User Management
              </button>
              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/* ========= Types ========= */
type UUID = string;

type EmpRow = {
  user_id: UUID;
  business_id: UUID;
  status: "invited" | "active" | "inactive" | "terminated";
  is_manager: boolean | null;
  is_admin: boolean | null;
};

type ProfileRow = { id: UUID; full_name: string | null };

type TORow = {
  id: UUID;
  user_id: UUID;
  start_ts: string;   // ISO
  end_ts: string;     // ISO
  reason: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
};

type Employee = { id: UUID; name: string };
type RequestVM = {
  id: UUID;
  employee_id: UUID;
  employee_name: string;
  startISO: string;
  endISO: string;
  reason: string;
  status: TORow["status"];
};

/* ========= Page ========= */
export default function TimeOffRequestsPage() {
  const supabase = createClientComponentClient();
  const [requests, setRequests] = useState<RequestVM[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<UUID>("");
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<UUID | null>(null);
  const [bizId, setBizId] = useState<UUID | null>(null);
  const [canManage, setCanManage] = useState(false);

  /* ----- boot ----- */
  useEffect(() => {
    (async () => {
      setLoading(true);

      // auth
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth.user) {
        console.error("Auth error", authErr);
        setLoading(false);
        return;
      }
      const me = auth.user;
      setUserId(me.id as UUID);

      // my employments
      const { data: myEmp, error: empErr } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("user_id", me.id)
        .eq("status", "active");

      if (empErr) {
        console.error("Employment load error", empErr);
        setLoading(false);
        return;
      }

      const mgrRow = (myEmp ?? []).find(r => (r.is_manager || r.is_admin) && r.status === "active");
      const chosenBiz = (mgrRow?.business_id ||
        (myEmp && myEmp[0]?.business_id) ||
        null) as UUID | null;

      setBizId(chosenBiz);
      setCanManage(Boolean(mgrRow));

      // coworkers list (for dropdown). If no business, fallback self only.
      let empList: Employee[] = [];
      if (chosenBiz) {
        const { data: coworkers, error: cwErr } = await supabase
          .from("employment")
          .select("user_id,status")
          .eq("business_id", chosenBiz)
          .eq("status", "active");

        if (cwErr) {
          console.error("Coworkers load error", cwErr);
        } else {
          const ids = Array.from(new Set((coworkers ?? []).map(r => r.user_id))) as UUID[];
          // fetch names for those ids
          const { data: profs, error: pErr } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ids);
          if (pErr) {
            console.error("Profiles load error", pErr);
          }
          const nameById = new Map<UUID, string>(
            (profs ?? []).map((p: ProfileRow) => [p.id, p.full_name || "Unknown"])
          );
          empList = ids
            .map(id => ({ id, name: nameById.get(id) || "Unknown" }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
      } else {
        empList = [{ id: me.id as UUID, name: me.email ?? "You" }];
      }
      setEmployees(empList);

      // load requests visible via RLS, then attach names
      await reloadRequests({ nameMapSeed: new Map(empList.map(e => [e.id, e.name])) });

      setLoading(false);
    })();
  }, []);

  /* ----- reload requests with independent name resolution ----- */
  async function reloadRequests(opts: { nameMapSeed: Map<UUID, string> }) {
    // 1) get all visible requests. RLS filters to: self, or employees of businesses you manage.
    const { data: rows, error } = await supabase
      .from("time_off_request")
      .select("id,user_id,start_ts,end_ts,reason,status")
      .order("start_ts", { ascending: false });

    if (error) {
      console.error("Time off load error", error);
      setRequests([]);
      return;
    }

    const reqs = (rows ?? []) as TORow[];

    // 2) collect distinct user_ids from requests
    const ids = Array.from(new Set(reqs.map(r => r.user_id))) as UUID[];

    // 3) fetch names for those ids not already in the seed map
    const missing = ids.filter(id => !opts.nameMapSeed.has(id));
    if (missing.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", missing);
      if (pErr) console.error("Profiles resolve error", pErr);
      (profs ?? []).forEach((p: ProfileRow) => {
        opts.nameMapSeed.set(p.id, p.full_name || "Unknown");
      });
    }

    // ensure your own name resolves
    if (userId && !opts.nameMapSeed.get(userId)) {
      opts.nameMapSeed.set(userId, "You");
    }

    // 4) map to VM
    const vms: RequestVM[] = reqs.map(r => ({
      id: r.id,
      employee_id: r.user_id,
      employee_name:
        opts.nameMapSeed.get(r.user_id) ||
        (userId && r.user_id === userId ? "You" : "Unknown"),
      startISO: new Date(r.start_ts).toISOString(),
      endISO: new Date(r.end_ts).toISOString(),
      reason: r.reason ?? "",
      status: r.status,
    }));

    setRequests(vms);
  }

  /* ----- calendar helpers ----- */
  const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  const handleDateClick = (date: Date) => {
    if (!startDate) {
      setStartDate(date);
      setEndDate(null);
      return;
    }
    if (!endDate) {
      if (date < startDate) {
        setEndDate(startDate);
        setStartDate(date);
      } else if (date.getTime() === startDate.getTime()) {
        setStartDate(null);
      } else {
        setEndDate(date);
      }
      return;
    }
    setStartDate(date);
    setEndDate(null);
  };

  const inRange = (date: Date) => {
    if (!startDate) return false;
    const end = endDate ?? startDate;
    return date >= startDate && date <= end;
  };
  const isEdge = (date: Date) =>
    (startDate && date.getTime() === startDate.getTime()) ||
    (endDate && date.getTime() === endDate.getTime());

  const weeks = useMemo(() => {
    const days: (Date | null)[] = [];
    const first = getFirstDayOfMonth(currentMonth);
    for (let i = 0; i < first; i++) days.push(null);
    const dim = getDaysInMonth(currentMonth);
    for (let d = 1; d <= dim; d++) days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
    const out: (Date | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [currentMonth]);

  /* ----- submit / update ----- */
  async function submitRequest() {
    if (!startDate || !selectedEmployee || !userId) return;
    const end = endDate ?? startDate;

    const startISO = startDate.toISOString();
    const endISO = end.toISOString();
    const payloadReason = reason || null;

    try {
      if (canManage && selectedEmployee !== userId) {
        const { error: rpcErr } = await supabase.rpc("manager_create_time_off", {
          p_user: selectedEmployee,
          p_start: startISO,
          p_end: endISO,
          p_reason: payloadReason,
        });
        if (rpcErr) throw rpcErr;
      } else {
        const { error: insErr } = await supabase.from("time_off_request").insert({
          user_id: userId,
          start_ts: startISO,
          end_ts: endISO,
          reason: payloadReason,
          status: "pending",
        });
        if (insErr) throw insErr;
      }

      // reset
      setStartDate(null);
      setEndDate(null);
      setSelectedEmployee("");
      setReason("");
      setShowForm(false);

      // reload with a fresh name map (from current employees + any new ids)
      const seed = new Map<UUID, string>(employees.map(e => [e.id, e.name]));
      await reloadRequests({ nameMapSeed: seed });
    } catch (e) {
      console.error("Submit error", e);
      alert(
        canManage && selectedEmployee !== userId
          ? "Manager RPC missing or insufficient permission."
          : "Submit failed."
      );
    }
  }

  async function updateRequestStatus(id: UUID, status: TORow["status"]) {
    try {
      const { error } = await supabase.from("time_off_request").update({ status }).eq("id", id);
      if (error) throw error;
      setRequests(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      console.error("Update status error", e);
      alert("Update failed.");
    }
  }

  /* ----- UI helpers ----- */
  const formatRange = (startISO: string, endISO: string) => {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return s.getTime() === e.getTime()
      ? s.toLocaleDateString("en-US", fmt)
      : `${s.toLocaleDateString("en-US", fmt)} - ${e.toLocaleDateString("en-US", fmt)}`;
  };

  const rowTint = (status: RequestVM["status"]) =>
    status === "approved"
      ? "bg-green-50 border-green-200 text-green-900"
      : status === "denied"
      ? "bg-red-50 border-red-200 text-red-900"
      : "bg-amber-50 border-amber-200 text-amber-900";

  const badgeTint = (status: RequestVM["status"]) =>
    status === "approved"
      ? "bg-green-100 text-green-800"
      : status === "denied"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";

  /* ----- render ----- */
  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Time Off Requests</h1>
            <p className="text-gray-600 mt-1">
              {canManage ? "View and manage your team’s time off" : "View and submit your time off"}
            </p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Create Time Off Request</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Calendar */}
              <div className="lg:col-span-2">
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900">
                      {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
                        }
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
                        }
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-7 gap-1 mb-3">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
                          {day}
                        </div>
                      ))}
                    </div>

                    {weeks.map((week, i) => (
                      <div key={i} className="grid grid-cols-7 gap-1">
                        {week.map((d, j) =>
                          d ? (
                            <button
                              key={`${i}-${j}`}
                              onClick={() => handleDateClick(d)}
                              className={`w-full aspect-square rounded-lg text-sm font-medium transition-colors ${
                                isEdge(d)
                                  ? "bg-blue-600 text-white"
                                  : inRange(d)
                                  ? "bg-blue-100 text-blue-900"
                                  : "bg-white text-gray-700 border border-gray-200 hover:border-blue-300"
                              }`}
                            >
                              {d.getDate()}
                            </button>
                          ) : (
                            <div key={`${i}-${j}`} className="w-full aspect-square" />
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
                  <select
                    value={selectedEmployee}
                    onChange={e => setSelectedEmployee(e.target.value as UUID)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">{canManage ? "Select employee" : "Select yourself"}</option>
                    {(canManage ? employees : employees.filter(e => e.id === userId)).map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                        {emp.id === userId ? " (You)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {startDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                    <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      <p className="text-sm text-gray-700">
                        {formatRange(
                          (startDate ?? new Date()).toISOString(),
                          (endDate ?? startDate).toISOString()
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reason (Optional)</label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Vacation, sick leave, personal…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitRequest}
                    disabled={!startDate || !selectedEmployee || (!canManage && selectedEmployee !== userId)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Submit
                  </button>
                </div>

                {!canManage && selectedEmployee && selectedEmployee !== userId && (
                  <p className="text-xs text-red-600">You can only submit your own request.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Requests */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Requests</h2>
          {requests.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No time off requests</p>
            </div>
          ) : (
            requests.map(r => (
              <div key={r.id} className={`bg-white border rounded-lg p-4 ${rowTint(r.status)}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{r.employee_name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{formatRange(r.startISO, r.endISO)}</p>
                    {r.reason && <p className="text-sm text-gray-600 mt-1">Reason: {r.reason}</p>}
                  </div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${badgeTint(r.status)}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </div>

                {canManage && r.status === "pending" && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => updateRequestStatus(r.id, "approved")}
                      className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateRequestStatus(r.id, "denied")}
                      className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

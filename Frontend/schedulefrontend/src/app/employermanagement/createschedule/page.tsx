"use client";

import React, { JSX, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X, ArrowLeft } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type UUID = string;

type Employee = {
  id: UUID;
  name: string;
  roleId?: UUID | null;
  roleName?: string;
};

type ShiftDraft = { employeeId: UUID; day: number; start: string; end: string };

type DayMeta = {
  day: number; // 0..6 index in this week
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

type SupabaseErrorObj = { code?: string; message?: string; details?: string; hint?: string } | null;

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

function clampTimeToStore(
  start: string,
  end: string,
  open = "09:00",
  close = "17:00"
) {
  const toM = (t: string) => {
    const [hh, mm] = t.split(":");
    return Number(hh) * 60 + Number(mm);
  };
  const toHH = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
      2,
      "0"
    )}`;

  const s = Math.max(toM(open), toM(start));
  const e = Math.min(toM(close), toM(end));
  if (s >= e) return { start: open, end: close };
  return { start: toHH(s), end: toHH(e) };
}

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
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [insertErrorObj, setInsertErrorObj] = useState<SupabaseErrorObj>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  // userId -> list of day indexes (0..6) where approved time off applies
  const [timeOffByUser, setTimeOffByUser] = useState<Record<string, number[]>>({});

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
    const storedLocs = storedLocsRaw
      ? (JSON.parse(storedLocsRaw) as string[])
      : [];

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

  /* ---------- Load user + business + location + employees + time off ---------- */
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
          if (!cancelled) setEmployees([]);
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

        // Time off for this week (approved only)
        if (!cancelled && ids.length > 0) {
          const weekStartDate = new Date(`${DAYS[0].ymd}T00:00:00`);
          const weekEndDate = new Date(`${DAYS[6].ymd}T23:59:59`);
          const weekStartISO = weekStartDate.toISOString();
          const weekEndISO = weekEndDate.toISOString();

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

          const plain: Record<string, number[]> = {};
          for (const [uid, set] of Object.entries(offByUser)) {
            plain[uid] = Array.from(set.values());
          }

          console.debug("Time off map for week", plain);
          setTimeOffByUser(plain);
        } else if (!cancelled) {
          setTimeOffByUser({});
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

  function openEditor(empId: string, day: number) {
    if (isEmployeeOffOnDay(empId, day)) {
      // Safety guard; UI should already prevent this.
      return;
    }
    const d = getDraft(empId, day);
    if (d) {
      setStartTime(d.start);
      setEndTime(d.end);
    } else {
      setStartTime(openHH);
      setEndTime(closeHH);
    }
    setEditing({ employeeId: empId, day });
  }

  function saveDraft() {
    if (!editing) return;
    if (isEmployeeOffOnDay(editing.employeeId, editing.day)) {
      // Just in case; do not allow saving if time off.
      setEditing(null);
      return;
    }

    const clamped = clampTimeToStore(startTime, endTime, openHH, closeHH);
    setDrafts((prev) => {
      const idx = prev.findIndex(
        (p) => p.employeeId === editing.employeeId && p.day === editing.day
      );
      const next = {
        employeeId: editing.employeeId,
        day: editing.day,
        start: clamped.start,
        end: clamped.end,
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

  async function handleConfirm() {
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

    // Filter out any drafts that fall on approved time off
    const validDrafts = drafts.filter(
      (d) => !isEmployeeOffOnDay(d.employeeId, d.day)
    );

    if (validDrafts.length === 0) {
      alert(
        drafts.length === 0
          ? "No shifts to create."
          : "All drafted shifts conflict with approved time off."
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

    setLoading(true);
    try {
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
          status: "published" as const,
          created_by: userId,
          _employeeId: d.employeeId,
        };
      });

      console.debug("Attempting to insert shifts", {
        userId,
        activeBusinessId,
        activeLocationId,
        count: shifts.length,
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
        setInsertErrorObj(insertErr ?? { message: String(insertErr) });
        const errObj = insertErr as {
          code?: string;
          message?: string;
          details?: string;
        };
        const extra =
          errObj?.code === "42501"
            ? " This looks like a row-level security (RLS) denial."
            : "";
        alert(
          `Could not create shifts: ${
            errObj.message ?? String(insertErr)
          }${errObj.code ? " (code: " + errObj.code + ")" : ""}${extra}`
        );
        return;
      }

      const inserted = (insertedRaw ?? []) as {
        id: string;
        start_ts: string;
        end_ts: string;
      }[];

      const assignments = inserted.map((row, idx) => ({
        shift_id: row.id,
        user_id: shifts[idx]._employeeId,
        assigned_by: userId!,
        assigned_at: new Date().toISOString(),
        status: "assigned" as const,
        source: "manager" as const,
      }));

      if (assignments.length) {
        const { error: asErr } = await supabase
          .from("shift_assignment")
          .insert(assignments);
        if (asErr) {
          console.error("assignment error", asErr);
          alert("Shifts created but assignments failed. See console.");
        }
      }

      alert("Schedule created.");
      setDrafts([]);
      router.replace("/employermanagement/employerhomepage");
    } finally {
      setLoading(false);
    }
  }

  const activeMeta: DayMeta | null =
    activeDay == null ? null : DAYS.find((d) => d.day === activeDay) ?? null;

  const shiftsPreview = useMemo(() => {
    if (!activeBusinessId || !activeLocationId || !userId) return [];
    const valid = drafts.filter((d) => !isEmployeeOffOnDay(d.employeeId, d.day));
    return valid.map((d) => {
      const dayObj = DAYS.find((x) => x.day === d.day)!;
      const dateStr = dayObj.ymd;
      const startISO = new Date(`${dateStr}T${d.start}:00`).toISOString();
      const endISO = new Date(`${dateStr}T${d.end}:00`).toISOString();
      return {
        business_id: activeBusinessId,
        location_id: activeLocationId,
        role_id: employees.find((e) => e.id === d.employeeId)?.roleId ?? null,
        start_ts: startISO,
        end_ts: endISO,
        status: "published",
        created_by: userId,
        _employeeId: d.employeeId,
      };
    });
  }, [drafts, activeBusinessId, activeLocationId, employees, userId, DAYS, timeOffByUser]);

  /* ---------- Early-outs ---------- */
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

  /* ---------- Render ---------- */
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

      <div className="max-w-6xl mx-auto px-4 pt-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Create Weekly Schedule
        </h1>
        <p className="text-gray-600 mt-1">
          Pick a day, see approved time off, and add shifts within store hours.
        </p>
      </div>

      {/* day tabs */}
      <div className="sticky top-14 z-30 bg-gray-50/90 backdrop-blur border-b border-gray-200 mt-4">
        <div className="max-w-6xl mx-auto px-2">
          <div className="flex overflow-x-auto no-scrollbar gap-2 py-2">
            {DAYS.map((d) => {
              const isActive = activeDay === d.day;
              return (
                <button
                  key={d.day}
                  onClick={() => setActiveDay(isActive ? null : d.day)}
                  className={`${
                    isActive
                      ? "bg-white border-blue-500 text-blue-700 shadow-sm"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  } relative shrink-0 px-4 py-2 rounded-xl border text-sm transition-all`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{d.label}</span>
                    <span className="text-gray-500">{d.uiDate}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isActive ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* day panel */}
      <div className="max-w-6xl mx-auto px-4">
        <div
          role="region"
          aria-hidden={activeDay == null}
          className={`${
            activeDay == null
              ? "max-h-0 opacity-0 -translate-y-2"
              : "max-h-[65vh] opacity-100 translate-y-0"
          } overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-[max-height,opacity,transform] duration-300 ease-out mt-4`}
        >
          <div className="px-5 pt-4 pb-3 flex items-start justify-between sticky top-0 bg-white">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {activeMeta ? `${activeMeta.label} — ${activeMeta.uiDate}` : ""}
              </h2>
              <p className="text-sm text-gray-600">
                Business:{" "}
                <span className="font-medium">{businessName ?? "—"}</span>
              </p>
              <p className="text-sm text-gray-600">
                Location:{" "}
                <span className="font-medium">{locationName ?? "—"}</span>
              </p>
              <p className="text-sm text-gray-600">
                Store Hours:{" "}
                <span className="font-medium">
                  {openHH} – {closeHH}
                </span>
              </p>
            </div>
            <button
              onClick={() => setActiveDay(null)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {activeDay != null && (
            <div className="px-5 pb-5 max-h-[55vh] overflow-y-auto">
              <div className="space-y-3">
                {employees.length === 0 && (
                  <p className="text-sm text-gray-500">
                    No active employees found for this business (or RLS blocked
                    the query). Check that you and your employees have active
                    employment rows for this business.
                  </p>
                )}
                {employees.map((e) => {
                  const d = getDraft(e.id, activeDay!);
                  const isOff = isEmployeeOffOnDay(e.id, activeDay);
                  return (
                    <div
                      key={e.id}
                      className={`bg-white border rounded-xl p-4 flex items-center justify-between ${
                        isOff ? "border-amber-200 bg-amber-50/40" : "border-gray-200"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {e.name}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {e.roleName}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {isOff ? (
                          <>
                            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              Approved time off
                            </span>
                          </>
                        ) : d ? (
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {d.start} – {d.end}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No shift</p>
                        )}

                        {!isOff && (
                          <button
                            onClick={() => openEditor(e.id, activeDay!)}
                            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                          >
                            {d ? "Edit" : "Add"}
                          </button>
                        )}
                        {d && !isOff && (
                          <button
                            onClick={() => removeDraft(e.id, activeDay!)}
                            className="px-2 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            aria-label="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Debug panel */}
        <div className="mt-6 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Debug: payload preview</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDebug((s) => !s)}
                className="px-3 py-1 text-sm border rounded-lg bg-white"
              >
                {showDebug ? "Hide" : "Show"}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    JSON.stringify(shiftsPreview, null, 2)
                  );
                }}
                className="px-3 py-1 text-sm bg-gray-100 rounded-lg"
              >
                Copy
              </button>
            </div>
          </div>
          {showDebug && (
            <pre className="max-h-60 overflow-auto p-3 bg-slate-900 text-slate-50 rounded-lg text-xs">
              {shiftsPreview.length
                ? JSON.stringify(shiftsPreview, null, 2)
                : "No payload: ensure a business, location, and at least one valid (non-time-off) draft shift exist."}
            </pre>
          )}
          {insertErrorObj && (
            <div className="mt-4">
              <div className="text-sm text-rose-600 mb-1">
                Insert error details
              </div>
              <pre className="max-h-40 overflow-auto p-3 bg-rose-900 text-rose-50 rounded-lg text-xs">
                {JSON.stringify(insertErrorObj, null, 2)}
              </pre>
              <div className="flex gap-2 mt-2 justify-end">
                <button
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      JSON.stringify(insertErrorObj, null, 2)
                    )
                  }
                  className="px-3 py-1 text-sm bg-gray-100 rounded-lg"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 mb-10 flex justify-end gap-3">
          <button
            onClick={() =>
              router.replace("/employermanagement/employerhomepage")
            }
            className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
          >
            Back to Home
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
          >
            Confirm Schedule
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
                  onClick={saveDraft}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                >
                  Save
                </button>
              </div>

              <p className="text-xs text-gray-500 pt-2">
                Shifts are constrained to store hours ({openHH}–{closeHH}) and
                cannot be created on approved time off days.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

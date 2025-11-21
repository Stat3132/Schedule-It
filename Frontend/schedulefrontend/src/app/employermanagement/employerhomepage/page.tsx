// app/employermanagement/employerhomepage/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

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
  source: "manager" | "autofill" | "swap";
};

type ProfileRow = { id: string; full_name: string | null };
type BusinessOpt = { id: string; name: string | null };
type LocationOpt = { id: string; name: string };

type TORow = {
  id: string;
  user_id: string;
  start_ts: string;
  end_ts: string;
  reason?: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
};

type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type AvailabilityStatus = "available" | "partial" | "unavailable";

type AvailabilityRow = {
  id: string;
  user_id: string;
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status?: string | null;
};

type AvailabilityPattern = Record<DayOfWeek, AvailabilityStatus>;

const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_KEYS: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type DayCell = {
  start?: string;
  end?: string;
  timeOffStatus?: TORow["status"];
  unavailable?: boolean;
  isDropPending?: boolean;
  isPickedUp?: boolean;
};

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

function normalizeToLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAvailabilityPattern(raw: unknown): AvailabilityPattern {
  let src: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.pattern && typeof r.pattern === "object" && r.pattern !== null) {
      src = r.pattern as Record<string, unknown>;
    } else {
      src = r;
    }
  }

  const out: Partial<AvailabilityPattern> = {};
  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v as AvailabilityStatus;
    } else {
      out[day] = "available";
    }
  }
  return out as AvailabilityPattern;
}

/* ---------- Component ---------- */
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

  /* ---------- Seed selection from localStorage ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBiz = localStorage.getItem("activeBusinessId");
    const storedLocsRaw = localStorage.getItem("activeLocationIds");
    const storedLocs = storedLocsRaw
      ? (JSON.parse(storedLocsRaw) as string[])
      : [];

    if (storedBiz) setSelectedBiz(storedBiz);
    if (storedLocs[0]) setSelectedLoc(storedLocs[0]);
  }, []);

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

      const { data: ownedRows, error: ownedErr } = await supabase
        .from("business")
        .select("id,name")
        .eq("owner_user_id", user.id);

      if (ownedErr) {
        console.warn("Owned business query error:", ownedErr.message);
      }

      const owned = (ownedRows ?? []) as { id: string; name: string | null }[];
      const idSet = new Set<string>(mgrIds);
      for (const b of owned) idSet.add(b.id);
      const idList = Array.from(idSet);

      let named: BusinessOpt[] = owned.map((r) => ({ id: r.id, name: r.name }));
      const needNames = idList.filter((id) => !owned.find((o) => o.id === id));

      if (needNames.length) {
        const { data: bRows } = await supabase
          .from("business")
          .select("id,name")
          .in("id", needNames);

        const extra = (bRows ?? []).map(
          (r: { id: string; name: string | null }) => ({
            id: r.id,
            name: r.name ?? null,
          }),
        );

        const existingIds = new Set(named.map((x) => x.id));
        named = named.concat(extra.filter((e) => !existingIds.has(e.id)));

        for (const id of needNames) {
          if (!named.find((n) => n.id === id)) named.push({ id, name: null });
        }
      }

      if (!cancelled) {
        setBusinesses(named);
        if (!selectedBiz && idList.length > 0) {
          setSelectedBiz(idList[0]);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* ---------- Persist selection ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBiz) {
      localStorage.setItem("activeBusinessId", selectedBiz);
    }
  }, [selectedBiz]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedLoc && selectedLoc !== "ALL") {
      localStorage.setItem("activeLocationIds", JSON.stringify([selectedLoc]));
    } else {
      localStorage.removeItem("activeLocationIds");
    }
  }, [selectedLoc]);

  /* ---------- Load locations ---------- */
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
  const scopeKey = useMemo(
    () => `${selectedBiz ?? ""}|${selectedLoc}`,
    [selectedBiz, selectedLoc],
  );

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
        return {
          label: d.toLocaleDateString([], { weekday: "long" }),
          date: fmtDateMMDD(d),
        };
      });

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

      let shiftQ = supabase
        .from("shift")
        .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
        .eq("business_id", selectedBiz)
        .neq("status", "canceled")
        .gte("start_ts", ws.toISOString())
        .lt("start_ts", we.toISOString());

      if (selectedLoc !== "ALL") {
        shiftQ = shiftQ.eq("location_id", selectedLoc);
      }

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

      const safeShifts: ShiftRow[] = Array.isArray(shifts)
        ? (shifts as ShiftRow[])
        : [];
      const shiftIds = safeShifts.map((s) => s.id);

      let assigns: AssignmentRow[] = [];
      if (shiftIds.length && employeeIds.length) {
        const { data: assignsRaw, error: asErr } = await supabase
          .from("shift_assignment")
          .select("id,shift_id,user_id,status,source")
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

        assigns = ((assignsRaw ?? []) as AssignmentRow[]).filter(
          (a) => a.status !== "declined",
        );
      }

      const timeOffByUserDay = new Map<string, Map<string, TORow["status"]>>();
      if (employeeIds.length) {
        const { data: torRaw, error: torErr } = await supabase
          .from("time_off_request")
          .select("id,user_id,start_ts,end_ts,status")
          .in("user_id", employeeIds);

        if (torErr) {
          console.error("Time off query failed:", torErr);
        } else if (torRaw) {
          const rows = torRaw as TORow[];
          for (const r of rows) {
            if (r.status !== "pending" && r.status !== "approved") continue;

            const startLocal = normalizeToLocalDay(new Date(r.start_ts));
            const endExclusive = normalizeToLocalDay(new Date(r.end_ts));
            const lastIncluded = new Date(endExclusive.getTime() - 1);

            for (
              let d = new Date(startLocal);
              d <= lastIncluded;
              d.setDate(d.getDate() + 1)
            ) {
              const ymd = toYMD(d);
              const existing = timeOffByUserDay.get(r.user_id) ?? new Map();
              existing.set(ymd, r.status);
              timeOffByUserDay.set(r.user_id, existing);
            }
          }
        }
      }

      const availByUser = new Map<string, AvailabilityPattern>();
      if (employeeIds.length) {
        const { data: avRaw, error: avErr } = await supabase
          .from("availability")
          .select(
            "id,user_id,weekly_pattern_json,effective_from,effective_to,status",
          )
          .in("user_id", employeeIds)
          .order("effective_from", { ascending: false });

        if (avErr) {
          console.error("Availability query failed:", avErr);
        } else if (avRaw) {
          const rows = avRaw as AvailabilityRow[];
          const byUser: Record<string, AvailabilityRow[]> = {};
          for (const r of rows) {
            if (!byUser[r.user_id]) byUser[r.user_id] = [];
            byUser[r.user_id].push(r);
          }
          for (const uid of Object.keys(byUser)) {
            const list = byUser[uid];
            const latest =
              list.find((r) => r.status === "approved") ?? list[0] ?? null;
            if (!latest) continue;
            availByUser.set(
              uid,
              normalizeAvailabilityPattern(latest.weekly_pattern_json),
            );
          }
        }
      }

      const byUser = new Map<string, GridRow>();
      for (const uid of employeeIds) {
        byUser.set(uid, {
          userId: uid,
          name: nameById.get(uid) ?? uid,
          byDay: Array.from({ length: 7 }, () => ({} as DayCell)),
        });
      }

      for (const a of assigns) {
        const sh = safeShifts.find((s) => s.id === a.shift_id);
        if (!sh) continue;

        const dow = new Date(sh.start_ts).getDay();
        const rec = byUser.get(a.user_id);
        if (!rec) continue;

        const baseCell: DayCell = {
          ...(rec.byDay[dow] ?? {}),
          start: new Date(sh.start_ts).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
          end: new Date(sh.end_ts).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        };

        if (a.status === "dropped") {
          baseCell.isDropPending = true;
        } else if (a.source === "swap") {
          baseCell.isPickedUp = true;
        }

        rec.byDay[dow] = baseCell;
      }

      for (const uid of employeeIds) {
        const row = byUser.get(uid);
        if (!row) continue;

        const availPattern = availByUser.get(uid) ?? null;
        const torMap = timeOffByUserDay.get(uid);

        for (let i = 0; i < 7; i++) {
          const date = new Date(ws);
          date.setDate(ws.getDate() + i);
          const ymd = toYMD(date);
          const cell = row.byDay[i] || ({} as DayCell);

          if (torMap) {
            const status = torMap.get(ymd);
            if (status) {
              cell.timeOffStatus = status;
            }
          }

          if (availPattern) {
            const dayKey = DAY_KEYS[i];
            if (availPattern[dayKey] === "unavailable") {
              cell.unavailable = true;
            }
          }

          row.byDay[i] = cell;
        }
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
  }, [scopeKey, supabase, selectedBiz, selectedLoc]);

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
          Ensure you either own a business or have an active employment with
          manager/admin rights.
        </div>
      </div>
    );

  /* ---------- Main content ---------- */
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Weekly Schedule</h1>
        <p className="text-gray-600 mt-1">
          {bizName} · {selectedLoc === "ALL" ? "All locations" : "One location"}
        </p>
        <p className="text-gray-600">{weekLabel}</p>
        {errorMsg && <p className="text-sm text-red-600 mt-2">{errorMsg}</p>}
      </div>

      {/* Scope controls */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Business
          </div>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-white"
            value={selectedBiz ?? ""}
            onChange={(e) => setSelectedBiz(e.target.value || null)}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? b.id}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Location
          </div>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-white"
            value={selectedLoc}
            onChange={(e) =>
              setSelectedLoc((e.target.value as string) || "ALL")
            }
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
      </div>

      {/* Full-width schedule card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full">
        {loading ? (
          <div className="p-6">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-4 text-left">
                  <div className="text-sm font-semibold text-gray-900">
                    Staff Member
                  </div>
                  <div className="text-xs text-gray-500">
                    {selectedLoc === "ALL"
                      ? "Business scope"
                      : "Business + Location scope"}
                  </div>
                </th>
                {days.map((d) => (
                  <th
                    key={d.label}
                    className="px-3 py-4 text-center min-w-[110px]"
                  >
                    <div className="text-sm font-semibold text-gray-900">
                      {d.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {d.date}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {grid.map((row) => (
                <tr
                  key={row.userId}
                  className="border-b border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-gray-900">
                      {row.name || row.userId}
                    </div>
                  </td>
                  {row.byDay.map((cell, idx) => (
                    <td key={idx} className="px-3 py-4 text-center">
                      {cell.start ? (
                        <div className="border rounded-lg p-2">
                          <div className="text-xs font-semibold">
                            {cell.start}
                          </div>
                          <div className="text-xs">{cell.end}</div>
                          {(cell.timeOffStatus ||
                            cell.unavailable ||
                            cell.isDropPending ||
                            cell.isPickedUp) && (
                            <div className="mt-1 text-[11px] text-amber-700">
                              {(() => {
                                const parts: string[] = [];
                                if (cell.timeOffStatus) {
                                  parts.push(
                                    cell.timeOffStatus === "pending"
                                      ? "Time off requested (pending)"
                                      : "Time off approved",
                                  );
                                }
                                if (cell.unavailable) {
                                  parts.push("Marked unavailable");
                                }
                                if (cell.isDropPending) {
                                  parts.push("Drop requested (pending review)");
                                } else if (cell.isPickedUp) {
                                  parts.push("Picked up shift");
                                }
                                return parts.join(" • ");
                              })()}
                            </div>
                          )}
                        </div>
                      ) : cell.timeOffStatus ? (
                        <div className="border border-amber-200 bg-amber-50 rounded-lg p-2 text-xs text-amber-900">
                          {cell.timeOffStatus === "pending"
                            ? "Time off requested (pending)"
                            : "Time off approved"}
                        </div>
                      ) : cell.unavailable ? (
                        <div className="border border-gray-200 bg-gray-50 rounded-lg p-2 text-xs text-gray-600">
                          Unavailable
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
                  <td
                    className="px-6 py-8 text-sm text-gray-500"
                    colSpan={1 + days.length}
                  >
                    No employees or no shifts for this week and scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

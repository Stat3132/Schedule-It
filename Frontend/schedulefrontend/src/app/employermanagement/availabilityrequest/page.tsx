"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  Calendar as CalendarIcon,
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { DayOfWeek, AvailabilityStatus } from "../../../lib/supabase";
import EmployerTopNav from "@/components/EmployerTopNav";

/* ========= Types ========= */
type UUID = string;

type DayRange = { start: string | null; end: string | null };

type WeeklyPatternPayload = {
  reason?: string | null;
  pattern?: Partial<Record<DayOfWeek, AvailabilityStatus>>;
  timeRanges?: Partial<Record<DayOfWeek, { start?: string | null; end?: string | null }>>;
};

type AvailabilityRow = {
  id: UUID;
  user_id: UUID;
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
  decided_by: UUID | null;
  decided_at: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  } | null;
};

type RequestVM = {
  id: UUID;
  employee_id: UUID;
  employee_name: string;
  employee_email?: string;
  effectiveFromISO: string;
  effectiveToISO: string | null;
  reason: string;
  status: AvailabilityRow["status"];
  decided_at: string | null;
  schedule: Record<DayOfWeek, AvailabilityStatus>;
  timeRanges: Record<DayOfWeek, DayRange>;
};

type FilterKey = "all" | "pending" | "approved" | "denied" | "canceled";

const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/* ========= Helpers ========= */

function asWeeklyPattern(raw: unknown): WeeklyPatternPayload {
  if (!raw || typeof raw !== "object") return {};
  return raw as WeeklyPatternPayload;
}

function normalizeSchedule(raw: unknown): Record<DayOfWeek, AvailabilityStatus> {
  const src = asWeeklyPattern(raw).pattern ?? {};
  const out: Partial<Record<DayOfWeek, AvailabilityStatus>> = {};

  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v;
    } else {
      out[day] = "available";
    }
  }

  return out as Record<DayOfWeek, AvailabilityStatus>;
}

function normalizeTimeRanges(raw: unknown): Record<DayOfWeek, DayRange> {
  const src = asWeeklyPattern(raw).timeRanges ?? {};
  const out: Partial<Record<DayOfWeek, DayRange>> = {};

  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v && typeof v === "object") {
      const start =
        typeof v.start === "string" && v.start.trim().length > 0 ? v.start : null;
      const end =
        typeof v.end === "string" && v.end.trim().length > 0 ? v.end : null;
      out[day] = { start, end };
    } else {
      out[day] = { start: null, end: null };
    }
  }

  return out as Record<DayOfWeek, DayRange>;
}

function extractReason(raw: unknown): string {
  const payload = asWeeklyPattern(raw);
  if (typeof payload.reason === "string") return payload.reason;

  if (
    payload.pattern &&
    typeof (payload as { pattern: { reason?: string } }).pattern.reason === "string"
  ) {
    // Handles any legacy shape where reason was nested under pattern
    return (payload as { pattern: { reason: string } }).pattern.reason;
  }

  return "";
}

function statusBadgeTint(status: AvailabilityRow["status"]) {
  return status === "approved"
    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
    : status === "denied"
    ? "bg-red-100 text-red-800 border border-red-200"
    : status === "canceled"
    ? "bg-slate-100 text-slate-700 border border-slate-200"
    : "bg-amber-100 text-amber-800 border border-amber-200";
}

function rowBorderTint(status: AvailabilityRow["status"]) {
  return status === "approved"
    ? "border-emerald-200"
    : status === "denied"
    ? "border-red-200"
    : status === "canceled"
    ? "border-slate-200"
    : "border-amber-200";
}

function formatDateRange(startISO: string, endISO: string | null) {
  const s = new Date(startISO);
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

  if (!endISO) {
    return `${s.toLocaleDateString("en-US", fmt)} onward`;
  }

  const e = new Date(endISO);
  return `${s.toLocaleDateString("en-US", fmt)} – ${e.toLocaleDateString(
    "en-US",
    fmt
  )}`;
}

function formatDateTimeShort(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanStatus(status: AvailabilityRow["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const filterLabel: Record<FilterKey, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  canceled: "Canceled",
};

const filterOrder: FilterKey[] = ["all", "pending", "approved", "denied", "canceled"];

/* Small per-day chip - similar to schedule view but compact */
function DayChip(props: {
  day: DayOfWeek;
  status: AvailabilityStatus;
  range: DayRange;
}) {
  const label = props.day.slice(0, 3); // Mon, Tue, ...
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border";
  const tint =
    props.status === "available"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : props.status === "unavailable"
      ? "bg-slate-50 border-slate-200 text-slate-600 line-through decoration-slate-400/70"
      : "bg-amber-50 border-amber-200 text-amber-800";

  const showTime =
    props.status === "partial" && (props.range.start || props.range.end);

  return (
    <span className={`${base} ${tint}`}>
      <span>{label}</span>
      {props.status === "partial" && <span>·</span>}
      {showTime && (
        <span className="tabular-nums">
          {props.range.start ?? "?"}–{props.range.end ?? "?"}
        </span>
      )}
    </span>
  );
}

/* ========= Page ========= */

export default function ManagerAvailabilityRequestsPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [requests, setRequests] = useState<RequestVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userId, setUserId] = useState<UUID | null>(null);
  const [decisionLoadingId, setDecisionLoadingId] = useState<UUID | null>(null);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  /* ---------- boot ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user) {
        console.error("Auth error", authErr);
        if (!cancelled) {
          setErrorMsg("Could not load your account. Please sign in again.");
          setRequests([]);
          setLoading(false);
        }
        return;
      }

      const uid = auth.user.id as UUID;
      if (cancelled) return;

      setUserId(uid);

      await reloadRequests();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* ---------- data load ---------- */
  async function reloadRequests() {
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("availability")
      .select(
        `
        id,
        user_id,
        weekly_pattern_json,
        effective_from,
        effective_to,
        status,
        decided_by,
        decided_at,
        profiles:profiles!avail_user_fk (
          full_name,
          email
        )
      `
      )
      .order("effective_from", { ascending: false })
      .returns<AvailabilityRow[]>();

    if (error) {
      console.error("Availability load error", error);
      setErrorMsg("Failed to load availability requests.");
      setRequests([]);
      return;
    }

    const rows = data ?? [];

    const vms: RequestVM[] = rows.map((r) => {
      const prof = r.profiles;
      const name =
        (prof?.full_name && prof.full_name.trim()) ||
        (prof?.email && prof.email?.trim()) ||
        "Unnamed employee";

      const schedule = normalizeSchedule(r.weekly_pattern_json);
      const timeRanges = normalizeTimeRanges(r.weekly_pattern_json);
      const reason = extractReason(r.weekly_pattern_json);

      return {
        id: r.id,
        employee_id: r.user_id,
        employee_name: name,
        employee_email: prof?.email ?? undefined,
        effectiveFromISO: new Date(r.effective_from).toISOString(),
        effectiveToISO: r.effective_to ? new Date(r.effective_to).toISOString() : null,
        reason,
        status: r.status,
        decided_at: r.decided_at,
        schedule,
        timeRanges,
      };
    });

    setRequests(vms);
  }

  /* ---------- actions ---------- */
  async function handleDecision(id: UUID, decision: "approved" | "denied") {
    if (!userId) return;

    setDecisionLoadingId(id);
    setErrorMsg(null);

    const nowISO = new Date().toISOString();

    const { data, error } = await supabase
      .from("availability")
      .update({
        status: decision,
        decided_by: userId,
        decided_at: nowISO,
      })
      .eq("id", id)
      .select("id,status,decided_at")
      .maybeSingle();

    if (error) {
      console.error("Availability decision update error", error);
      setErrorMsg("Updating the availability request failed. Please try again.");
      setDecisionLoadingId(null);
      return;
    }

    if (!data) {
      setErrorMsg("Request could not be updated (not found or not permitted).");
      setDecisionLoadingId(null);
      return;
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: data.status as RequestVM["status"],
              decided_at: data.decided_at,
            }
          : r
      )
    );

    setDecisionLoadingId(null);
  }

  /* ---------- helpers ---------- */

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = {
      all: requests.length,
      pending: 0,
      approved: 0,
      denied: 0,
      canceled: 0,
    };
    for (const r of requests) {
      base[r.status] += 1;
    }
    return base;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const monthLabel = useMemo(
    () =>
      currentMonth.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [currentMonth]
  );

  const monthSummary = useMemo(
    () =>
      requests.filter((r) => {
        const s = new Date(r.effectiveFromISO);
        const e = r.effectiveToISO ? new Date(r.effectiveToISO) : s;
        const monthStart = new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth(),
          1
        );
        const monthEnd = new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() + 1,
          0
        );
        return e >= monthStart && s <= monthEnd;
      }),
    [requests, currentMonth]
  );

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="px-6 py-4 rounded-xl bg-white shadow-sm border border-slate-200 text-slate-700 text-sm">
          Loading availability requests…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <EmployerTopNav />
      <div className="max-w-6xl mx-auto px-4 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-700 mb-2">
                <ShieldCheck className="w-3 h-3" />
                Manager · Availability
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Availability Requests
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Review employees’ requested availability patterns, including partial-day
                windows, and approve or deny changes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
                )
              }
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </button>
            <div className="px-3 py-1.5 rounded-lg bg-slate-900 text-xs font-medium text-white">
              {monthLabel}
            </div>
            <button
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
                )
              }
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </header>

        {/* Error banner */}
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {/* Summary cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Pending
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-100">
                <Filter className="w-3 h-3 mr-1" />
                Needs review
              </span>
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {counts.pending}
              <span className="text-xs font-normal text-slate-500 ml-1">open</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Availability changes awaiting your decision.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                This month
              </span>
              <CalendarIcon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {monthSummary.length}
              <span className="text-xs font-normal text-slate-500 ml-1">requests</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Any availability period overlapping {monthLabel.toLowerCase()}.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Total
              </span>
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {counts.all}
              <span className="text-xs font-normal text-slate-500 ml-1">lifetime</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              All availability requests visible to your role.
            </p>
          </div>
        </section>

        {/* Filter + list */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-medium text-slate-700">
                Filter by status
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filterOrder.map((key) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {filterLabel[key]}
                  <span
                    className={`ml-1 inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full text-[10px] ${
                      filter === key
                        ? "bg-slate-800 text-slate-100"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Requests list */}
          <div className="divide-y divide-slate-100">
            {filteredRequests.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {requests.length === 0
                  ? "There are no availability requests available for your role yet."
                  : "No requests match the current filter."}
              </div>
            ) : (
              filteredRequests.map((r) => (
                <div
                  key={r.id}
                  className={`px-4 py-4 md:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-50/60 ${rowBorderTint(
                    r.status
                  )}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {r.employee_name}
                      </p>
                      {r.employee_email && (
                        <span className="text-xs text-slate-500 truncate">
                          · {r.employee_email}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-700">
                      {formatDateRange(r.effectiveFromISO, r.effectiveToISO)}
                    </p>

                    {r.reason && (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Reason:</span>{" "}
                        {r.reason}
                      </p>
                    )}

                    {/* Weekly pattern chips */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ALL_DAYS.map((day) => (
                        <DayChip
                          key={day}
                          day={day}
                          status={r.schedule[day]}
                          range={r.timeRanges[day]}
                        />
                      ))}
                    </div>

                    {r.decided_at && r.status !== "pending" && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Decided {formatDateTimeShort(r.decided_at)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-stretch md:items-end gap-2">
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeTint(
                        r.status
                      )}`}
                    >
                      {humanStatus(r.status)}
                    </span>

                    {r.status === "pending" ? (
                      <div className="flex items-center gap-2 mt-1 md:mt-0">
                        <button
                          onClick={() => handleDecision(r.id, "denied")}
                          disabled={decisionLoadingId === r.id}
                          className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Deny
                        </button>
                        <button
                          onClick={() => handleDecision(r.id, "approved")}
                          disabled={decisionLoadingId === r.id}
                          className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1 md:mt-0">
                        Decision recorded for this request.
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

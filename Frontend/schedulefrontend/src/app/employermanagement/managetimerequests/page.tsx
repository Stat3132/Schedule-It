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
} from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import EmployerTopNav from "@/components/EmployerTopNav";

/* ========= Types ========= */
type UUID = string;

type TORow = {
  id: UUID;
  user_id: UUID;
  start_ts: string;
  end_ts: string;
  reason: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
  decided_by: UUID | null;
  decided_at: string | null;
};

type RowWithProfile = TORow & {
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
  startISO: string;
  endISO: string;
  reason: string;
  status: TORow["status"];
  decided_at: string | null;
};

type FilterKey = "all" | "pending" | "approved" | "denied" | "canceled";

/* ========= Page ========= */
export default function ManagerTimeOffRequestsPage() {
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
  }, [supabase]);

  /* ---------- data load ---------- */
  async function reloadRequests() {
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("time_off_request")
      .select(
        `
        id,
        user_id,
        start_ts,
        end_ts,
        reason,
        status,
        decided_by,
        decided_at,
        profiles:profiles!tor_user_fk (
          full_name,
          email
        )
      `
      )
      .order("start_ts", { ascending: false })
      .returns<RowWithProfile[]>();

    if (error) {
      console.error("Time off load error", error);
      setErrorMsg("Failed to load time off requests.");
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

      return {
        id: r.id,
        employee_id: r.user_id,
        employee_name: name,
        employee_email: prof?.email ?? undefined,
        startISO: new Date(r.start_ts).toISOString(),
        endISO: new Date(r.end_ts).toISOString(),
        reason: r.reason ?? "",
        status: r.status,
        decided_at: r.decided_at,
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
      .from("time_off_request")
      .update({
        status: decision,
        decided_by: userId,
        decided_at: nowISO,
      })
      .eq("id", id)
      .select("id,status,decided_at")
      .maybeSingle();

    if (error) {
      console.error("Decision update error", error);
      setErrorMsg("Updating the request failed. Please try again.");
      setDecisionLoadingId(null);
      return;
    }

    if (!data) {
      // No row matched (could be RLS or already updated)
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
  const formatRange = (startISO: string, endISO: string) => {
    const s = new Date(startISO);
    const e = new Date(endISO);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return s.getTime() === e.getTime()
      ? s.toLocaleDateString("en-US", fmt)
      : `${s.toLocaleDateString("en-US", fmt)} – ${e.toLocaleDateString("en-US", fmt)}`;
  };

  const formatDateTimeShort = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const badgeTint = (status: RequestVM["status"]) =>
    status === "approved"
      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
      : status === "denied"
      ? "bg-red-100 text-red-800 border border-red-200"
      : status === "canceled"
      ? "bg-slate-100 text-slate-700 border border-slate-200"
      : "bg-amber-100 text-amber-800 border border-amber-200";

  const rowBorder = (status: RequestVM["status"]) =>
    status === "approved"
      ? "border-emerald-200"
      : status === "denied"
      ? "border-red-200"
      : status === "canceled"
      ? "border-slate-200"
      : "border-amber-200";

  const filterLabel: Record<FilterKey, string> = {
    all: "All",
    pending: "Pending",
    approved: "Approved",
    denied: "Denied",
    canceled: "Canceled",
  };

  const filterOrder: FilterKey[] = ["all", "pending", "approved", "denied", "canceled"];

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

  const requestTouchesMonth = (r: RequestVM) => {
    const s = new Date(r.startISO);
    const e = new Date(r.endISO);
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
  };

  const monthSummary = useMemo(
    () => requests.filter(requestTouchesMonth),
    [requests, currentMonth]
  );

  /* ---------- render ---------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="px-6 py-4 rounded-xl bg-white shadow-sm border border-slate-200 text-slate-700 text-sm">
          Loading time off requests…
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
                Manager · Time Off
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Time Off Requests
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Review, approve, or deny time off for your team. Decisions are tracked for
                audit history.
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
              Requests awaiting your decision.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                This month
              </span>
            </div>
            <div className="text-2xl font-semibold text-slate-900">
              {monthSummary.length}
              <span className="text-xs font-normal text-slate-500 ml-1">requests</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Any time off overlapping {monthLabel.toLowerCase()}.
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
              All requests visible to your role.
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
                  ? "There are no time off requests available for your role yet."
                  : "No requests match the current filter."}
              </div>
            ) : (
              filteredRequests.map((r) => (
                <div
                  key={r.id}
                  className={`px-4 py-4 md:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-50/60 ${rowBorder(
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
                      {formatRange(r.startISO, r.endISO)}
                    </p>
                    {r.reason && (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">Reason:</span>{" "}
                        {r.reason}
                      </p>
                    )}
                    {r.decided_at && r.status !== "pending" && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Decided {formatDateTimeShort(r.decided_at)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-stretch md:items-end gap-2">
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${badgeTint(
                        r.status
                      )}`}
                    >
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
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

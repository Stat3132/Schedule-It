"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createAnnouncement } from "../../../lib/announcements";
import { useI18n } from "../../../lib/i18n";

/* ========= Types ========= */
type UUID = string;

type TORow = {
  id: UUID;
  user_id: UUID;
  start_ts: string; // timestamptz in DB (start of first day, local midnight in UTC)
  end_ts: string;   // timestamptz in DB (exclusive: start of day AFTER last day)
  reason: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
};

type RequestVM = {
  id: UUID;
  employee_id: UUID;
  employee_name: string;
  // normalized to local day-midnight ISOs for display
  startISO: string;
  endISO: string;
  // local YYYY-MM-DD for inclusive per-day checks
  startYMD: string;
  endYMD: string;
  reason: string;
  status: TORow["status"];
};

/* ========= Helpers ========= */
function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeToLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* ========= Page ========= */
export default function TimeOffRequestsPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { t, locale } = useI18n();

  const [requests, setRequests] = useState<RequestVM[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<UUID | null>(null);
  const [displayName, setDisplayName] = useState<string>(
    t("employee.timeOff.currentUserFallback"),
  );

  /* ----- boot ----- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth.user) {
        console.error("Auth error", authErr);
        if (!cancelled) {
          setRequests([]);
          setLoading(false);
        }
        return;
      }

      const me = auth.user;
      const uid = me.id as UUID;
      if (cancelled) return;

      setUserId(uid);

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", uid)
        .maybeSingle();

      if (pErr) console.error("Profile load error", pErr);

      const fallbackName = t("employee.timeOff.currentUserFallback");
      const name =
        (prof?.full_name && prof.full_name.trim()) ||
        (prof?.email && prof.email.trim()) ||
        fallbackName;

      if (!cancelled) {
        setDisplayName(name);
        await reloadRequests(uid, name);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, t]);

  /* ----- reload requests for this user ----- */
  async function reloadRequests(uid: UUID, name: string) {
    const { data: rows, error } = await supabase
      .from("time_off_request")
      .select("id,user_id,start_ts,end_ts,reason,status")
      .eq("user_id", uid)
      .order("start_ts", { ascending: false });

    if (error) {
      console.error("Time off load error", error);
      setRequests([]);
      return;
    }

    const reqs = (rows ?? []) as TORow[];

    const vms: RequestVM[] = reqs.map((r) => {
      const startRaw = new Date(r.start_ts);   // stored start (inclusive)
      const endRaw = new Date(r.end_ts);       // stored exclusive end

      // Last included local day is endRaw - 1 ms
      const lastIncluded = new Date(endRaw.getTime() - 1);

      const firstDay = normalizeToLocalDay(startRaw);
      const lastDay = normalizeToLocalDay(lastIncluded);

      return {
        id: r.id,
        employee_id: r.user_id,
        employee_name: name,
        startISO: firstDay.toISOString(),
        endISO: lastDay.toISOString(),
        startYMD: toYMD(firstDay),
        endYMD: toYMD(lastDay),
        reason: r.reason ?? "",
        status: r.status,
      };
    });

    setRequests(vms);
  }

  /* ----- calendar helpers ----- */
  const getDaysInMonth = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  const handleDateClick = (date: Date) => {
    const day = normalizeToLocalDay(date);

    if (!startDate) {
      setStartDate(day);
      setEndDate(null);
      return;
    }
    if (!endDate) {
      const startDay = normalizeToLocalDay(startDate);
      if (day < startDay) {
        setEndDate(startDay);
        setStartDate(day);
      } else if (day.getTime() === startDay.getTime()) {
        // clicking same date again clears selection
        setStartDate(null);
        setEndDate(null);
      } else {
        setEndDate(day);
      }
      return;
    }
    // start + end already set → start new range
    setStartDate(day);
    setEndDate(null);
  };

  const inRange = (date: Date) => {
    if (!startDate) return false;
    const startDay = normalizeToLocalDay(startDate);
    const endDay = normalizeToLocalDay(endDate ?? startDate);
    const d = normalizeToLocalDay(date);
    return d >= startDay && d <= endDay;
  };

  const isEdge = (date: Date) => {
    if (!startDate) return false;
    const startDay = normalizeToLocalDay(startDate);
    const endDay = normalizeToLocalDay(endDate ?? startDate);
    const d = normalizeToLocalDay(date);
    return d.getTime() === startDay.getTime() || d.getTime() === endDay.getTime();
  };

  // Does *any* existing time-off request cover this calendar day?
  // Uses local YYYY-MM-DD range [startYMD, endYMD] inclusive.
  const dayHasRequest = (date: Date) => {
    const dYMD = toYMD(normalizeToLocalDay(date));
    return requests.some((r) => dYMD >= r.startYMD && dYMD <= r.endYMD);
  };

  const weeks = useMemo(() => {
    const days: (Date | null)[] = [];
    const first = getFirstDayOfMonth(currentMonth);
    for (let i = 0; i < first; i++) days.push(null);

    const dim = getDaysInMonth(currentMonth);
    for (let d = 1; d <= dim; d++) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
    }

    const out: (Date | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [currentMonth]);

  const weekdayLabels = useMemo(() => {
    const reference = new Date(Date.UTC(2023, 0, 1));
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(reference);
      date.setUTCDate(reference.getUTCDate() + index);
      return formatter.format(date);
    });
  }, [locale]);

  /* ----- submit ----- */
  async function submitRequest() {
    if (!startDate || !userId) return;

    const startDay = normalizeToLocalDay(startDate);
    const endBase = normalizeToLocalDay(endDate ?? startDate);

    // Store as [startDay, dayAfterLast) in UTC, so last day is fully covered.
    const endExclusive = new Date(endBase);
    endExclusive.setDate(endExclusive.getDate() + 1);

    const startISO = startDay.toISOString();
    const endISO = endExclusive.toISOString();
    const payloadReason = reason || null;

    try {
      const { error: insErr } = await supabase.from("time_off_request").insert({
        user_id: userId,
        start_ts: startISO,
        end_ts: endISO,
        reason: payloadReason,
        status: "pending",
      });

      if (insErr) throw insErr;

        // Create an announcement so managers/employees see the new request
        try {
          const reasonBlock = payloadReason
            ? `\n\n${t("shared.labels.reason")}: ${payloadReason}`
            : "";
          await createAnnouncement(
            supabase,
            userId,
            t("employee.timeOff.announcementTitle", {
              name: displayName || t("employee.timeOff.currentUserFallback"),
            }),
            t("employee.timeOff.announcementBody", {
              range: formatRange(startISO, endISO),
              reasonBlock,
            }),
            [] // broadcast to all roles
          );
        } catch (e) {
          console.error("Failed to create announcement for time off:", e);
        }

      setStartDate(null);
      setEndDate(null);
      setReason("");
      setShowForm(false);

      await reloadRequests(userId, displayName || t("employee.timeOff.currentUserFallback"));
    } catch (e) {
      console.error("Submit error", e);
      alert(t("employee.timeOff.alert.submitError"));
    }
  }

  /* ----- UI helpers ----- */
  const formatRange = (startISO: string, endISO: string) => {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    });
    const startLabel = formatter.format(new Date(startISO));
    const endLabel = formatter.format(new Date(endISO));
    if (startLabel === endLabel) return startLabel;
    return `${startLabel} - ${endLabel}`;
  };

  const rowTint = (status: RequestVM["status"]) =>
    status === "approved"
      ? "bg-green-50 border-green-200 text-green-900 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700"
      : status === "denied"
      ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-900 dark:text-red-200 dark:border-red-700"
      : status === "canceled"
      ? "bg-border text-foreground/70 border border-border"
      : "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700";

  const badgeTint = (status: RequestVM["status"]) =>
    status === "approved"
      ? "bg-green-100 text-green-800 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700"
      : status === "denied"
      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 dark:border-red-700"
      : status === "canceled"
      ? "bg-border text-foreground/70"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700";

  /* ----- render ----- */
  if (loading)
    return (
      <div className="text-center py-8">{t("shared.state.loading")}</div>
    );

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {t("employee.timeOff.title")}
              </h1>
              <p className="text-foreground/70 mt-1">
                {t("employee.timeOff.subtitle")}
              </p>

              <div className="mt-3">
                <label className="block text-sm font-medium text-foreground/70 mb-2">
                  {t("employee.timeOff.requestingAs")}
                </label>
                <div className="px-3 py-2 border border-border rounded-lg bg-background text-sm text-foreground">
                  {displayName}{" "}
                  <span className="text-foreground/60 text-xs">
                    {t("employee.timeOff.currentUserTag")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("employee.timeOff.newRequest")}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-background rounded-lg border border-border shadow-sm p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {t("employee.timeOff.form.title")}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label={t("shared.buttons.close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Calendar */}
              <div className="lg:col-span-2">
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-900">
                      {currentMonth.toLocaleDateString(locale, {
                        month: "long",
                        year: "numeric",
                      })}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setCurrentMonth(
                            new Date(
                              currentMonth.getFullYear(),
                              currentMonth.getMonth() - 1
                            )
                          )
                        }
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setCurrentMonth(
                            new Date(
                              currentMonth.getFullYear(),
                              currentMonth.getMonth() + 1
                            )
                          )
                        }
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-background border border-border rounded-lg p-4">
                    <div className="grid grid-cols-7 gap-1 mb-3">
                      {weekdayLabels.map((day) => (
                        <div
                          key={day}
                          className="text-center text-xs font-semibold text-foreground/60 py-2"
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    {weeks.map((week, i) => (
                      <div key={i} className="grid grid-cols-7 gap-1">
                        {week.map((d, j) => {
                          if (!d) {
                            return (
                              <div key={`${i}-${j}`} className="w-full aspect-square" />
                            );
                          }

                          const isEdgeDay = isEdge(d);
                          const isInRangeDay = inRange(d);
                          const hasRequest = dayHasRequest(d);

                          let classes =
                            "w-full aspect-square rounded-lg text-sm font-medium transition-colors ";

                          if (isEdgeDay) {
                            classes += "bg-blue-600 text-white";
                          } else if (isInRangeDay) {
                            classes += "bg-blue-100 text-blue-900";
                          } else if (hasRequest) {
                            classes +=
                              "bg-teal-50 text-teal-900 border border-teal-200";
                          } else {
                            classes +=
                              "bg-background text-foreground border border-border hover:border-blue-300";
                          }

                          return (
                            <button
                              key={`${i}-${j}`}
                              onClick={() => handleDateClick(d)}
                              className={classes}
                            >
                              {d.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form (current user only) */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("employee.timeOff.requestingAs")}
                  </label>
                  <div className="px-3 py-2 border border-border rounded-lg bg-background text-sm text-foreground">
                    {displayName}{" "}
                    <span className="text-gray-500 text-xs">
                      {t("employee.timeOff.currentUserTag")}
                    </span>
                  </div>
                </div>

                {startDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t("employee.timeOff.form.dateRangeLabel")}
                    </label>
                    <div className="px-3 py-2 border border-border rounded-lg bg-background">
                      <p className="text-sm text-gray-700">
                        {formatRange(
                          normalizeToLocalDay(startDate).toISOString(),
                          normalizeToLocalDay(endDate ?? startDate).toISOString()
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-foreground/70 mb-2">
                      {t("employee.timeOff.form.reasonOptional")}
                    </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("employee.timeOff.form.reasonPlaceholder")}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-background text-foreground"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowForm(false)}
                    className="flex-1 px-4 py-2 border border-border text-foreground font-medium rounded-lg hover:bg-background/50 transition-colors"
                  >
                    {t("employee.timeOff.form.cancel")}
                  </button>
                  <button
                    onClick={submitRequest}
                    disabled={!startDate || !userId}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {t("employee.timeOff.form.submit")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Requests list */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t("employee.timeOff.section.yourRequests")}
          </h2>
          {requests.length === 0 ? (
            <div className="bg-background rounded-lg border border-border p-8 text-center">
              <p className="text-foreground/60">
                {t("employee.timeOff.section.empty")}
              </p>
            </div>
          ) : (
            requests.map((r) => (
              <div
                key={r.id}
                className={`bg-background border rounded-lg p-4 ${rowTint(r.status)}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {r.employee_name}
                    </h3>
                    <p className="text-sm text-foreground/70 mt-1">
                      {formatRange(r.startISO, r.endISO)}
                    </p>
                    {r.reason && (
                      <p className="text-sm text-foreground/70 mt-1">
                        {t("employee.timeOff.request.reasonPrefix")} {r.reason}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${badgeTint(
                      r.status
                    )}`}
                  >
                    {t(`shared.status.${r.status}`)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

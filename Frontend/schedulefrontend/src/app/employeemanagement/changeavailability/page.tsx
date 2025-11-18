"use client";

import { useEffect, useState } from "react";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { DayOfWeek, AvailabilityStatus } from "../../../lib/supabase";
import { CurrentAvailability } from "../../../components/ui/CurrentAvailability";
import { NewRequestModal } from "../../../components/ui/NewRequestModal";

type WeeklyPattern = Record<DayOfWeek, AvailabilityStatus>;

type AvailabilityRow = {
  id: string;
  user_id: string;
  weekly_pattern_json: any;
  effective_from: string;
  effective_to: string | null;
};

const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const EMPTY_SCHEDULE: WeeklyPattern = {
  monday: "available",
  tuesday: "available",
  wednesday: "available",
  thursday: "available",
  friday: "available",
  saturday: "available",
  sunday: "available",
};

function normalizePattern(raw: any): WeeklyPattern {
  const src = raw?.pattern ?? raw ?? {};
  const out: Partial<WeeklyPattern> = {};

  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v;
    } else {
      out[day] = "available";
    }
  }

  return out as WeeklyPattern;
}

function extractReason(raw: any): string | undefined {
  if (!raw) return undefined;
  if (typeof raw.reason === "string" && raw.reason.trim().length > 0) {
    return raw.reason;
  }
  if (raw.pattern && typeof raw.pattern.reason === "string") {
    return raw.pattern.reason;
  }
  return undefined;
}

export default function AvailabilityPage() {
  const supabase = createClientComponentClient();

  const [currentSchedule, setCurrentSchedule] =
    useState<WeeklyPattern | null>(null);
  const [history, setHistory] = useState<AvailabilityRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      try {
        const { data: auth, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Auth error", error);
          return;
        }
        if (!auth?.user) {
          console.warn("No logged-in user");
          return;
        }

        const uid = auth.user.id;
        if (cancelled) return;

        setUserId(uid);
        await loadAvailability(uid, cancelled);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const loadAvailability = async (uid: string, cancelled = false) => {
    const { data, error } = await supabase
      .from("availability")
      .select("id,user_id,weekly_pattern_json,effective_from,effective_to,status")
      .eq("user_id", uid)
      .order("effective_from", { ascending: false });

    if (error) {
      console.error("Error loading availability:", error);
      return;
    }

    const rows = (data ?? []) as AvailabilityRow[];
    if (cancelled) return;

    setHistory(rows);

    if (rows.length > 0) {
      const latest = rows.find((r: any) => r.status === "approved") ?? rows[0];
      setCurrentSchedule(normalizePattern(latest.weekly_pattern_json));
    } else {
      setCurrentSchedule(null);
    }
  };

  const handleSubmitRequest = async (requestData: {
    startDate: Date;
    endDate: Date;
    schedule: Record<DayOfWeek, AvailabilityStatus>;
    timeRanges: Record<DayOfWeek, { start: string | null; end: string | null }>;
    reason: string;
  }) => {
    if (!userId) {
      alert("No user id; please sign in again.");
      return;
    }

    const startDateStr = requestData.startDate.toISOString().split("T")[0];
    const endDateStr = requestData.endDate.toISOString().split("T")[0];

    const weekly_pattern_json = {
      pattern: requestData.schedule,
      timeRanges: requestData.timeRanges,
      reason: requestData.reason,
    };

    try {
      const { error } = await supabase.from("availability").insert({
        user_id: userId,
        weekly_pattern_json,
        effective_from: startDateStr,
        effective_to: endDateStr,
        status: "pending",
      });

      if (error) throw error;

      await loadAvailability(userId);
      setIsModalOpen(false);
      alert("Availability request submitted successfully.");
    } catch (err) {
      console.error("Error submitting availability change:", err);
      alert("Failed to submit availability change. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Availability</h1>
            <p className="text-gray-600 mt-1">Manage your work schedule</p>
          </div>
          <CalendarIcon className="w-8 h-8 text-gray-400" />
        </div>

        <CurrentAvailability schedule={currentSchedule ?? EMPTY_SCHEDULE} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Availability History
            </h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Availability Period
            </button>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No availability records yet</p>
              <p className="text-sm mt-1">
                Click &quot;New Availability Period&quot; to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((row: any, idx) => {
                const reason = extractReason(row.weekly_pattern_json);
                const start = new Date(row.effective_from);
                const end = row.effective_to ? new Date(row.effective_to) : null;
                const rangeLabel = end
                  ? `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`
                  : `${start.toLocaleDateString()} onward`;
                const isLatest = idx === 0;
                const statusLabel = row.status ?? "pending";

                return (
                  <div
                    key={row.id}
                    className="border border-gray-200 rounded-lg p-4 flex justify-between items-start"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {rangeLabel}{" "}
                        {isLatest && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            Latest
                          </span>
                        )}
                      </p>
                      {reason && (
                        <p className="text-sm text-gray-600 mt-1">
                          Reason: {reason}
                        </p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full border text-gray-700 bg-gray-50">
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <NewRequestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitRequest}
      />
    </div>
  );
}

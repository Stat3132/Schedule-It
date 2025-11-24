"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createAnnouncement } from "../../../lib/announcements";
import type { DayOfWeek, AvailabilityStatus } from "../../../lib/supabase";
import { CurrentAvailability } from "../../../components/ui/CurrentAvailability";
import { NewRequestModal } from "../../../components/ui/NewRequestModal";

type WeeklyPattern = Record<DayOfWeek, AvailabilityStatus>;

type AvailabilityRow = {
  id: string;
  user_id: string;
  weekly_pattern_json: {
    pattern?: Partial<WeeklyPattern> | null;
    timeRanges?: Record<
      DayOfWeek,
      { start: string | null; end: string | null }
    > | null;
    reason?: string | null;
  } | null;
  effective_from: string;
  effective_to: string | null;
  status?: string | null;
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

function normalizePattern(raw: unknown): WeeklyPattern {
  let src: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.pattern && typeof r.pattern === "object" && r.pattern !== null) {
      src = r.pattern as Record<string, unknown>;
    } else {
      src = r;
    }
  }

  const out: Partial<WeeklyPattern> = {};
  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v as AvailabilityStatus;
    } else {
      out[day] = "available";
    }
  }
  return out as WeeklyPattern;
}

function extractReason(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.reason === "string" && r.reason.trim().length > 0) return r.reason;
  if (r.pattern && typeof r.pattern === "object") {
    const p = r.pattern as Record<string, unknown>;
    if (typeof p.reason === "string") return p.reason;
  }
  return undefined;
}

export default function AvailabilityPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

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
      .select(
        "id,user_id,weekly_pattern_json,effective_from,effective_to,status",
      )
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
      const latest = rows.find((r) => r.status === "approved") ?? rows[0];
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

      try {
        await createAnnouncement(
          supabase,
          userId,
          `Availability request submitted`,
          `Availability requested for ${startDateStr} → ${endDateStr}${
            requestData.reason ? `\n\nReason: ${requestData.reason}` : ""
          }`,
          [],
        );
      } catch (e) {
        console.error(
          "Failed to create announcement for availability request:",
          e,
        );
      }

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Availability
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your work schedule
              </p>
            </div>
          </div>
          <CalendarIcon className="w-8 h-8 text-muted-foreground" />
        </div>

        {/* Current availability card (already themed inside the component) */}
        <CurrentAvailability schedule={currentSchedule ?? EMPTY_SCHEDULE} />

        {/* History */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-card-foreground">
              Availability History
            </h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Availability Period
            </button>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-muted" />
              <p>No availability records yet</p>
              <p className="text-sm mt-1">
                Click &quot;New Availability Period&quot; to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((row: AvailabilityRow, idx) => {
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
                    className="border border-border rounded-lg p-4 flex justify-between items-start bg-background/60"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {rangeLabel}{" "}
                        {isLatest && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                            Latest
                          </span>
                        )}
                      </p>
                      {reason && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Reason: {reason}
                        </p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full border border-border text-foreground bg-muted">
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

"use client";

import type { AvailabilityStatus, DayOfWeek } from "../../lib/supabase";

interface WeekScheduleProps {
  schedule: Record<DayOfWeek, AvailabilityStatus>;
  timeRanges: Record<DayOfWeek, { start: string | null; end: string | null }>;
  onScheduleChange: (day: DayOfWeek, status: AvailabilityStatus) => void;
  onTimeRangeChange: (
    day: DayOfWeek,
    range: { start: string | null; end: string | null }
  ) => void;
}

const DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const STATUS_CONFIG: Record<
  AvailabilityStatus,
  { label: string; color: string; hoverColor: string }
> = {
  available: {
    label: "Available",
    color: "bg-green-500",
    hoverColor: "hover:bg-green-600",
  },
  partial: {
    label: "Partial",
    color: "bg-yellow-500",
    hoverColor: "hover:bg-yellow-600",
  },
  unavailable: {
    label: "Unavailable",
    color: "bg-red-500",
    hoverColor: "hover:bg-red-600",
  },
};

export function WeekSchedule({
  schedule,
  timeRanges,
  onScheduleChange,
  onTimeRangeChange,
}: WeekScheduleProps) {
  return (
    <div className="space-y-4">
      {DAYS.map((day) => {
        const status = schedule[day];
        const range = timeRanges[day] ?? { start: null, end: null };

        return (
          <div key={day} className="flex flex-col gap-2 border-b pb-3 last:border-b-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground capitalize w-28">
                {day}
              </span>
              <div className="flex gap-2">
                {(Object.keys(STATUS_CONFIG) as AvailabilityStatus[]).map((s) => {
                  const config = STATUS_CONFIG[s];
                  const isSelected = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onScheduleChange(day, s)}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? `${config.color} text-white`
                          : "bg-background text-foreground/70 hover:bg-background/95"
                      }`}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {status === "partial" && (
              <div className="ml-28 flex items-center gap-3">
                <label className="text-xs text-foreground/70">From</label>
                <input
                  type="time"
                  value={range.start ?? ""}
                  onChange={(e) =>
                    onTimeRangeChange(day, {
                      start: e.target.value || null,
                      end: range.end,
                    })
                  }
                  className="border border-border rounded-md px-2 py-1 text-xs bg-transparent text-foreground"
                />
                <label className="text-xs text-foreground/70">to</label>
                <input
                  type="time"
                  value={range.end ?? ""}
                  onChange={(e) =>
                    onTimeRangeChange(day, {
                      start: range.start,
                      end: e.target.value || null,
                    })
                  }
                  className="border border-border rounded-md px-2 py-1 text-xs bg-transparent text-foreground"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

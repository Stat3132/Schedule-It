"use client";

import { useMemo } from "react";
import type { AvailabilityStatus, DayOfWeek } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";

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

const STATUS_CONFIG: Record<AvailabilityStatus, { color: string }> = {
  available: {
    color: "bg-green-500",
  },
  partial: {
    color: "bg-yellow-500",
  },
  unavailable: {
    color: "bg-red-500",
  },
};

export function WeekSchedule({
  schedule,
  timeRanges,
  onScheduleChange,
  onTimeRangeChange,
}: WeekScheduleProps) {
  const { t, locale } = useI18n();
  const dayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "long" });
    const reference = new Date(Date.UTC(2023, 0, 2));
    return DAYS.map((_, index) => {
      const date = new Date(reference);
      date.setUTCDate(reference.getUTCDate() + index);
      return formatter.format(date);
    });
  }, [locale]);
  return (
    <div className="space-y-4">
      {DAYS.map((day, index) => {
        const status = schedule[day];
        const range = timeRanges[day] ?? { start: null, end: null };

        return (
          <div key={day} className="flex flex-col gap-2 border-b pb-3 last:border-b-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground capitalize w-28">
                {dayLabels[index]}
              </span>
              <div className="flex gap-2">
                {(Object.keys(STATUS_CONFIG) as AvailabilityStatus[]).map((option) => {
                  const config = STATUS_CONFIG[option];
                  const label = t(`employee.availability.status.${option}`);
                  const isSelected = status === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onScheduleChange(day, option)}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? `${config.color} text-white`
                          : "bg-background text-foreground/70 hover:bg-background/95"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {status === "partial" && (
              <div className="ml-28 flex items-center gap-3">
                <label className="text-xs text-foreground/70">
                  {t("shared.labels.from")}
                </label>
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
                <label className="text-xs text-foreground/70">
                  {t("shared.labels.to")}
                </label>
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

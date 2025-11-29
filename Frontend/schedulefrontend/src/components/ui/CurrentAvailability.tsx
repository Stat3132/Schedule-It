"use client";

import { useMemo } from "react";
import type { AvailabilityStatus, DayOfWeek } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";

interface CurrentAvailabilityProps {
  schedule: Record<DayOfWeek, AvailabilityStatus>;
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

const STATUS_COLORS: Record<AvailabilityStatus, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  partial: "bg-yellow-100 text-yellow-800 border-yellow-200",
  unavailable: "bg-red-100 text-red-800 border-red-200",
};

export function CurrentAvailability({ schedule }: CurrentAvailabilityProps) {
  const { t, locale } = useI18n();
  const dayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "long" });
    const reference = new Date(Date.UTC(2023, 0, 2)); // Monday
    return DAYS.map((_, index) => {
      const date = new Date(reference);
      date.setUTCDate(reference.getUTCDate() + index);
      return formatter.format(date);
    });
  }, [locale]);

  return (
    <div className="bg-background rounded-xl shadow-sm border border-border p-6">
      <h2 className="text-xl font-semibold text-foreground mb-4">
        {t("employee.availability.current.title")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAYS.map((day, index) => {
          const status: AvailabilityStatus = schedule[day] ?? "available";
          const colorClass = STATUS_COLORS[status];

          return (
            <div key={day} className="flex items-center justify-between p-3 bg-background/95 rounded-lg">
              <span className="text-sm font-medium text-foreground capitalize">
                {dayLabels[index]}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
                {t(`employee.availability.status.${status}`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

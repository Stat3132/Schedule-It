"use client";

import type { AvailabilityStatus, DayOfWeek } from "../../../lib/supabase";

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

const STATUS_DISPLAY: Record<
  AvailabilityStatus,
  { label: string; color: string }
> = {
  available: {
    label: "Available",
    color: "bg-green-100 text-green-800 border-green-200",
  },
  partial: {
    label: "Partial",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  unavailable: {
    label: "Unavailable",
    color: "bg-red-100 text-red-800 border-red-200",
  },
};

export function CurrentAvailability({ schedule }: CurrentAvailabilityProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Current Availability
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAYS.map((day) => {
          const status: AvailabilityStatus = schedule[day] ?? "available";
          const config = STATUS_DISPLAY[status];

          return (
            <div
              key={day}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-sm font-medium text-gray-700 capitalize">
                {day}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium border ${config.color}`}
              >
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

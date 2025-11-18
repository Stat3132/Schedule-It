"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Calendar } from "./Calendar";
import { WeekSchedule } from "./WeekSchedule";
import type { AvailabilityStatus, DayOfWeek } from "../../lib/supabase";

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    startDate: Date;
    endDate: Date;
    schedule: Record<DayOfWeek, AvailabilityStatus>;
    // per-day time ranges for days marked as "partial"
    timeRanges: Record<DayOfWeek, { start: string | null; end: string | null }>;
    reason: string;
  }) => void;
}

const DEFAULT_SCHEDULE: Record<DayOfWeek, AvailabilityStatus> = {
  monday: "available",
  tuesday: "available",
  wednesday: "available",
  thursday: "available",
  friday: "available",
  saturday: "available",
  sunday: "available",
};

const DEFAULT_TIME_RANGES: Record<DayOfWeek, { start: string | null; end: string | null }> = {
  monday: { start: null, end: null },
  tuesday: { start: null, end: null },
  wednesday: { start: null, end: null },
  thursday: { start: null, end: null },
  friday: { start: null, end: null },
  saturday: { start: null, end: null },
  sunday: { start: null, end: null },
};

export function NewRequestModal({ isOpen, onClose, onSubmit }: NewRequestModalProps) {
  const [step, setStep] = useState<"date" | "schedule">("date");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [schedule, setSchedule] =
    useState<Record<DayOfWeek, AvailabilityStatus>>(DEFAULT_SCHEDULE);
  const [timeRanges, setTimeRanges] =
    useState<Record<DayOfWeek, { start: string | null; end: string | null }>>(
      DEFAULT_TIME_RANGES
    );
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  const handleDateSelect = (date: Date) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(date);
      setEndDate(null);
    } else {
      if (date < startDate) {
        setEndDate(startDate);
        setStartDate(date);
      } else {
        setEndDate(date);
      }
    }
  };

  const handleContinue = () => {
    if (startDate && endDate) {
      setStep("schedule");
    }
  };

  const handleScheduleChange = (day: DayOfWeek, status: AvailabilityStatus) => {
    setSchedule((prev) => ({ ...prev, [day]: status }));
  };

  const handleTimeRangeChange = (
    day: DayOfWeek,
    range: { start: string | null; end: string | null }
  ) => {
    setTimeRanges((prev) => ({ ...prev, [day]: range }));
  };

  const handleSubmit = () => {
    if (startDate && endDate && reason.trim()) {
      onSubmit({
        startDate,
        endDate,
        schedule,
        timeRanges,
        reason,
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setStep("date");
    setStartDate(null);
    setEndDate(null);
    setSchedule(DEFAULT_SCHEDULE);
    setTimeRanges(DEFAULT_TIME_RANGES);
    setReason("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {step === "date" ? "Select Date Range" : "Set Weekly Schedule"}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {step === "date" ? (
            <div className="space-y-4">
              <div className="text-center mb-4">
                {startDate && !endDate && (
                  <p className="text-sm text-gray-600">
                    Start:{" "}
                    <span className="font-medium">
                      {startDate.toLocaleDateString()}
                    </span>
                    <br />
                    <span className="text-xs text-gray-500">
                      Now select an end date
                    </span>
                  </p>
                )}
                {startDate && endDate && (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">
                      {startDate.toLocaleDateString()}
                    </span>{" "}
                    -{" "}
                    <span className="font-medium">
                      {endDate.toLocaleDateString()}
                    </span>
                  </p>
                )}
              </div>

              <Calendar
                onDateSelect={handleDateSelect}
                selectedDate={endDate || startDate}
              />

              <button
                onClick={handleContinue}
                disabled={!startDate || !endDate}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Continue to Schedule
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-sm text-gray-600 mb-4">
                <p>
                  Period:{" "}
                  <span className="font-medium">
                    {startDate?.toLocaleDateString()} -{" "}
                    {endDate?.toLocaleDateString()}
                  </span>
                </p>
              </div>

              <WeekSchedule
                schedule={schedule}
                timeRanges={timeRanges}
                onScheduleChange={handleScheduleChange}
                onTimeRangeChange={handleTimeRangeChange}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Availability Change <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Please explain why your availability is changing..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={4}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("date")}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!reason.trim()}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Submit Request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

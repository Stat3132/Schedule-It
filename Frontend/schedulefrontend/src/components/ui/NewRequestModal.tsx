"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Calendar } from "./Calendar";
import { WeekSchedule } from "./WeekSchedule";
import type { AvailabilityStatus, DayOfWeek } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";

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
  const [schedule, setSchedule] = useState<Record<DayOfWeek, AvailabilityStatus>>(
    DEFAULT_SCHEDULE
  );
  const [timeRanges, setTimeRanges] = useState<
    Record<DayOfWeek, { start: string | null; end: string | null }>
  >(DEFAULT_TIME_RANGES);
  const [reason, setReason] = useState("");
  const { t, locale } = useI18n();

  const formatDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return (date: Date | null) => (date ? formatter.format(date) : "");
  }, [locale]);

  if (!isOpen) return null;

  const resetState = () => {
    setStep("date");
    setStartDate(null);
    setEndDate(null);
    setSchedule(DEFAULT_SCHEDULE);
    setTimeRanges(DEFAULT_TIME_RANGES);
    setReason("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDateSelect = (date: Date) => {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (!startDate || (startDate && endDate)) {
      setStartDate(normalized);
      setEndDate(null);
      return;
    }

    if (!endDate && startDate) {
      if (normalized.getTime() === startDate.getTime()) {
        setEndDate(normalized);
        return;
      }

      if (normalized < startDate) {
        setEndDate(startDate);
        setStartDate(normalized);
        return;
      }

      setEndDate(normalized);
    }
  };

  const handleContinue = () => {
    if (startDate && !endDate) {
      setEndDate(startDate);
      setStep("schedule");
      return;
    }

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
    if (!startDate || !reason.trim()) return;

    const effectiveEnd = endDate ?? startDate;

    onSubmit({
      startDate,
      endDate: effectiveEnd,
      schedule,
      timeRanges,
      reason: reason.trim(),
    });
    handleClose();
  };

  const renderDateStatus = () => {
    if (startDate && !endDate) {
      return (
        <p className="text-sm text-foreground/70">
          {t("employee.availability.modal.startSelected", {
            date: formatDate(startDate),
          })}
        </p>
      );
    }

    if (startDate && endDate) {
      return (
        <p className="text-sm text-foreground/70">
          {t("employee.availability.modal.rangeSelected", {
            start: formatDate(startDate),
            end: formatDate(endDate),
          })}
        </p>
      );
    }

    return (
      <p className="text-sm text-foreground/70">
        {t("employee.availability.modal.dateInstructions")}
      </p>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-background rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">
            {step === "date"
              ? t("employee.availability.modal.dateTitle")
              : t("employee.availability.modal.scheduleTitle")}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("shared.buttons.close")}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-foreground/70" />
          </button>
        </div>

        <div className="p-6">
          {step === "date" ? (
            <div className="space-y-4">
              <div className="text-center mb-4 space-y-1">{renderDateStatus()}</div>

              <Calendar onDateSelect={handleDateSelect} selectedDate={endDate || startDate} />

              <button
                type="button"
                onClick={handleContinue}
                disabled={!startDate || !endDate}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed"
              >
                {t("employee.availability.modal.continue")}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-sm text-foreground/70 mb-2">
                <span className="font-medium text-foreground">
                  {t("shared.labels.period")}:
                </span>{" "}
                <span>
                  {t("employee.availability.modal.rangeSelected", {
                    start: formatDate(startDate),
                    end: formatDate(endDate),
                  })}
                </span>
              </div>

              <WeekSchedule
                schedule={schedule}
                timeRanges={timeRanges}
                onScheduleChange={handleScheduleChange}
                onTimeRangeChange={handleTimeRangeChange}
              />

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("employee.availability.modal.reasonLabel")}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("employee.availability.modal.reasonPlaceholder")}
                  className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent resize-none bg-background"
                  rows={4}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("date")}
                  className="flex-1 py-3 border border-border text-foreground rounded-lg font-medium hover:bg-muted/50 transition-colors"
                >
                  {t("shared.buttons.back")}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!reason.trim()}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  {t("employee.availability.modal.submit")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

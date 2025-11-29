export type ScheduleSlot = {
  day: string;
  time: string;
  title: string;
};

export type ScheduleCardPayload = {
  type: "scheduleCard";
  weekKey: string;
  weekLabel: string;
  summary: string;
  slots: ScheduleSlot[];
};

export type ForwardRequestType = "timeOff" | "availability";

export type ForwardCardPayload = {
  type: "forwardCard";
  requestType: ForwardRequestType;
  requestId: string;
  status: string;
  statusLabel: string;
  rangeLabel: string;
  submittedAt: string;
  reason?: string | null;
  requesterId?: string | null;
  forwardedById?: string | null;
  forwardedByName?: string | null;
};

export const SCHEDULE_CARD_PREFIX = "__SCHEDULE_CARD__:";
export const FORWARD_CARD_PREFIX = "__FORWARD_CARD__:";

export function encodeScheduleCard(payload: ScheduleCardPayload) {
  return `${SCHEDULE_CARD_PREFIX}${JSON.stringify(payload)}`;
}

export function parseScheduleCard(content: string): ScheduleCardPayload | null {
  if (!content.startsWith(SCHEDULE_CARD_PREFIX)) return null;
  try {
    const raw = content.slice(SCHEDULE_CARD_PREFIX.length);
    const parsed = JSON.parse(raw);
    if (parsed?.type !== "scheduleCard") return null;
    return parsed as ScheduleCardPayload;
  } catch {
    return null;
  }
}

export function encodeForwardCard(payload: ForwardCardPayload) {
  return `${FORWARD_CARD_PREFIX}${JSON.stringify(payload)}`;
}

export function parseForwardCard(content: string): ForwardCardPayload | null {
  if (!content.startsWith(FORWARD_CARD_PREFIX)) return null;
  try {
    const raw = content.slice(FORWARD_CARD_PREFIX.length);
    const parsed = JSON.parse(raw);
    if (parsed?.type !== "forwardCard") return null;
    return parsed as ForwardCardPayload;
  } catch {
    return null;
  }
}

// app/employermanagement/messages/page.tsx

"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  CalendarDays,
  Check,
  EllipsisVertical,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Share2,
  Users,
  X,
} from "lucide-react";
import {
  ForwardCardPayload,
  parseForwardCard,
  parseScheduleCard,
  ScheduleCardPayload,
} from "../../../lib/messagingCards";
import {
  loadReadCounts,
  saveReadCounts,
  saveUnreadFlag,
  UnreadScope,
} from "../../../lib/unreadTracker";
import { useI18n } from "../../../lib/i18n";
import { ConversationSkeleton } from "@/components/messages/ConversationSkeleton";

const DECISION_FEEDBACK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SHIFT_START = "09:00";
const DEFAULT_SHIFT_END = "17:00";

type ScheduleEditorDay = {
  dayIndex: number;
  dateISO: string;
  label: string;
  works: boolean;
  startTime: string;
  endTime: string;
  shiftId: string | null;
  assignmentId: string | null;
  status: string | null;
  roleId: string | null;
  locationId: string | null;
  businessId: string | null;
};

function toLocalYMD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToTimeInput(iso: string | null | undefined) {
  if (!iso) return DEFAULT_SHIFT_START;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DEFAULT_SHIFT_START;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTimeLabel(time: string) {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  const hours = Number(hStr);
  const minutes = Number(mStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const ref = new Date();
  ref.setHours(hours, minutes, 0, 0);
  return ref.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function humanizeDateLabel(dateISO: string) {
  const date = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateISO;
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeToMinutes(time: string) {
  const [hStr, mStr] = time.split(":");
  const hours = Number(hStr);
  const minutes = Number(mStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

type UUID = string;

type Profile = {
  id: UUID;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
  profile_title?: string | null;
};

type MessageRow = {
  id: UUID;
  sender_id: UUID;
  recipient_id: UUID;
  content: string;
  created_at: string;
};

type DMConversation = {
  peer: Profile;
  lastMessage: MessageRow | null;
};

const EMPLOYER_SCOPE: UnreadScope = "employer";

type GroupChat = {
  id: UUID;
  name: string;
  memberIds: UUID[];
  createdBy?: UUID | null;
};

type GroupMessageRow = {
  id: UUID;
  group_id: UUID;
  sender_id: UUID;
  content: string;
  created_at: string;
};

type ConversationMessage =
  | (MessageRow & { kind: "dm" })
  | (GroupMessageRow & { kind: "group" });

type ScheduleSummarySlot = {
  day: string;
  time: string;
  title: string;
};

type EmploymentSnapshot = {
  employmentId: UUID | null;
  businessId: UUID | null;
  primaryRoleId: UUID | null;
  roleIds: UUID[];
  locationId: UUID | null;
};
function formatStatusLabel(status: string) {
  switch (status) {
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "canceled":
      return "Canceled";
    default:
      return "Pending";
  }
}

function formatForwardType(type: ForwardCardPayload["requestType"] | null | undefined) {
  switch (type) {
    case "timeOff":
      return "Time off";
    case "availability":
      return "Availability";
    default:
      return "Request";
  }
}

function dmChannelName(a: UUID, b: UUID) {
  return ["dm", ...[a, b].sort()].join(":");
}

function groupChannelName(groupId: UUID) {
  return `group:${groupId}`;
}

function profileDisplayName(profile?: Profile | null, fallback?: string) {
  const display = profile?.display_name?.trim();
  if (display) return display;
  const full = profile?.full_name?.trim();
  if (full) return full;
  const email = profile?.email?.trim();
  if (email) return email;
  const fallbackValue = fallback?.trim();
  return fallbackValue && fallbackValue.length ? fallbackValue : "";
}

function profileInitials(profile?: Profile | null) {
  const fallback = profile?.email ?? "?";
  const source = profileDisplayName(profile, fallback).trim() || fallback;
  if (!source) return "?";
  const parts = source.split(/\s+/).slice(0, 2);
  const chars = parts
    .map((part) => (part[0] ?? "").toUpperCase())
    .join("");
  return chars || "?";
}

function AvatarCircle({
  profile,
  sizeClass = "h-8 w-8",
  className = "",
}: {
  profile: Profile | null;
  sizeClass?: string;
  className?: string;
}) {
  const initials = profileInitials(profile);
  const avatarUrl = profile?.photo_url?.trim() ? profile.photo_url : null;
  const alt = profileDisplayName(profile, profile?.email ?? "Profile photo") || "Profile photo";
  return (
    <div
      className={[
        "relative flex items-center justify-center rounded-full border border-border/60 bg-muted/40 text-[11px] font-semibold text-foreground/80 overflow-hidden",
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={`${alt} avatar`}
          fill
          sizes="64px"
          className="object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

export default function EmployerMessagingPage() {
  const supabase = createClientComponentClient();
  const { t } = useI18n();
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<UUID | null>(null);

  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selfProfile, setSelfProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activePeer, setActivePeer] = useState<Profile | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false);

  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [businessScopeChecked, setBusinessScopeChecked] = useState(false);
  const [managedBusinessIds, setManagedBusinessIds] = useState<UUID[]>([]);
  const [employmentMetaByUserId, setEmploymentMetaByUserId] = useState<Record<UUID, EmploymentSnapshot>>({});
  const [roleLookup, setRoleLookup] = useState<Record<UUID, string>>({});
  const [locationLookup, setLocationLookup] = useState<Record<UUID, string>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days">("all");
  const [activePeerSchedule, setActivePeerSchedule] = useState<ScheduleSummarySlot[]>([]);
  const [isPeerScheduleLoading, setIsPeerScheduleLoading] = useState(false);
  const [peerScheduleError, setPeerScheduleError] = useState<string | null>(null);

  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [requestStatusMap, setRequestStatusMap] = useState<Record<string, string>>({});
  const [requestStatusOverrides, setRequestStatusOverrides] = useState<Record<string, string>>({});
  const [forwardActionState, setForwardActionState] = useState<{
    card: ForwardCardPayload | null;
    action: "approve" | "deny" | null;
  }>({ card: null, action: null });
  const [forwardActionError, setForwardActionError] = useState<string | null>(null);
  const [isForwardActionLoading, setIsForwardActionLoading] = useState(false);
  const [scheduleModalState, setScheduleModalState] = useState<
    { payload: ScheduleCardPayload; employeeName: string; employeeId: UUID } | null
  >(null);
  const [scheduleEditorDays, setScheduleEditorDays] = useState<ScheduleEditorDay[]>([]);
  const [isScheduleEditorLoading, setIsScheduleEditorLoading] = useState(false);
  const [isScheduleEditorSaving, setIsScheduleEditorSaving] = useState(false);
  const [scheduleEditorError, setScheduleEditorError] = useState<string | null>(null);
  const [scheduleEditorSuccess, setScheduleEditorSuccess] = useState<string | null>(null);
  const [scheduleEditorReloadKey, setScheduleEditorReloadKey] = useState(0);
  const [decisionFeedback, setDecisionFeedback] = useState<
    | {
        requestId: string;
        status: "approved" | "denied";
        requestType: ForwardCardPayload["requestType"];
        rangeLabel: string;
        expiresAt: number;
      }
    | null
  >(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [addContactSearch, setAddContactSearch] = useState("");
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isGroupBuilderOpen, setIsGroupBuilderOpen] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState("");
  const [groupDraftMembers, setGroupDraftMembers] = useState<Record<UUID, boolean>>({});
  const [groupBuilderError, setGroupBuilderError] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [incomingCounts, setIncomingCounts] = useState<Record<string, number>>({});
  const [groupIncomingCounts, setGroupIncomingCounts] = useState<Record<string, number>>({});
  const dmTotalsRef = useRef<Record<string, number>>({});
  const groupTotalsRef = useRef<Record<string, number>>({});
  const dmReadCountsRef = useRef<Record<string, number>>({});
  const groupReadCountsRef = useRef<Record<string, number>>({});
  const [readCountsReady, setReadCountsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    dmReadCountsRef.current = loadReadCounts(EMPLOYER_SCOPE, "dm");
    groupReadCountsRef.current = loadReadCounts(EMPLOYER_SCOPE, "group");
    setReadCountsReady(true);
  }, []);

  // Load active peer schedule summary
  useEffect(() => {
    const peerId = activePeer?.id ?? null;
    if (!peerId) {
      setActivePeerSchedule([]);
      setPeerScheduleError(null);
      setIsPeerScheduleLoading(false);
      return;
    }

    let cancelled = false;

    async function loadScheduleForPeer(userId: UUID) {
      setIsPeerScheduleLoading(true);
      setPeerScheduleError(null);
      try {
        const startOfWeek = new Date();
        startOfWeek.setHours(0, 0, 0, 0);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        const { data: assignmentRows, error: assignmentError } = await supabase
          .from("shift_assignment")
          .select("shift_id")
          .eq("user_id", userId);

        if (assignmentError) {
          throw assignmentError;
        }

        const shiftIds = (assignmentRows ?? [])
          .map((row) => row.shift_id as string | null)
          .filter((id): id is string => Boolean(id));

        if (!shiftIds.length) {
          setActivePeerSchedule([]);
          return;
        }

        const weekStartISO = startOfWeek.toISOString();
        const weekEndISO = endOfWeek.toISOString();

        const { data: shiftRows, error: shiftError } = await supabase
          .from("shift")
          .select("id,start_ts,end_ts,role_id,location_id")
          .in("id", shiftIds)
          .gte("start_ts", weekStartISO)
          .lt("start_ts", weekEndISO)
          .order("start_ts", { ascending: true })
          .limit(20);

        if (shiftError) {
          throw shiftError;
        }

        if (cancelled) return;

        if (Array.isArray(shiftRows)) {
          const mapped: ScheduleSummarySlot[] = shiftRows.map((shift) => {
            const start = shift.start_ts;
            const d = new Date(start);
            const dayLabel = d.toLocaleDateString([], { weekday: "short" });
            const timeLabel = d.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const roleName = shift.role_id ? roleLookup[shift.role_id as UUID] : null;
            const locationName = shift.location_id ? locationLookup[shift.location_id as UUID] : null;
            const title = (roleName && roleName.trim()) || (locationName && locationName.trim()) || "Shift";
            return { day: dayLabel, time: timeLabel, title };
          });
          setActivePeerSchedule(mapped);
        } else {
          setActivePeerSchedule([]);
        }
      } catch (err) {
        console.error("Error loading peer schedule:", err);
        if (!cancelled) {
          setActivePeerSchedule([]);
          setPeerScheduleError("Unable to load this teammate’s schedule.");
        }
      } finally {
        if (!cancelled) {
          setIsPeerScheduleLoading(false);
        }
      }
    }

    loadScheduleForPeer(peerId);

    return () => {
      cancelled = true;
    };
  }, [supabase, activePeer?.id, roleLookup, locationLookup]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<SupabaseClient['channel']> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGroupRef = useRef<GroupChat | null>(null);
  const actionMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const actionMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const addContactAnchorRef = useRef<HTMLButtonElement | null>(null);
  const addContactPanelRef = useRef<HTMLDivElement | null>(null);

  const persistDmReads = useCallback((next: Record<string, number>) => {
    dmReadCountsRef.current = next;
    saveReadCounts(EMPLOYER_SCOPE, "dm", next);
  }, []);

  const persistGroupReads = useCallback((next: Record<string, number>) => {
    groupReadCountsRef.current = next;
    saveReadCounts(EMPLOYER_SCOPE, "group", next);
  }, []);

  const markPeerAsRead = useCallback(
    (peerId: UUID | null) => {
      if (!peerId || !readCountsReady) return;
      const latestTotal = dmTotalsRef.current[peerId] ?? 0;
      const current = dmReadCountsRef.current[peerId] ?? 0;
      if (current === latestTotal) return;
      const next = { ...dmReadCountsRef.current, [peerId]: latestTotal };
      persistDmReads(next);
      setIncomingCounts((prev) => {
        if (!prev[peerId]) return prev;
        const clone = { ...prev };
        delete clone[peerId];
        return clone;
      });
    },
    [readCountsReady, persistDmReads],
  );

  const markGroupAsRead = useCallback(
    (groupId: UUID | null) => {
      if (!groupId || !readCountsReady) return;
      const latestTotal = groupTotalsRef.current[groupId] ?? 0;
      const current = groupReadCountsRef.current[groupId] ?? 0;
      if (current === latestTotal) return;
      const next = { ...groupReadCountsRef.current, [groupId]: latestTotal };
      persistGroupReads(next);
      setGroupIncomingCounts((prev) => {
        if (!prev[groupId]) return prev;
        const clone = { ...prev };
        delete clone[groupId];
        return clone;
      });
    },
    [readCountsReady, persistGroupReads],
  );

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  useEffect(() => {
    markPeerAsRead(activePeer?.id ?? null);
  }, [activePeer?.id, markPeerAsRead]);

  useEffect(() => {
    markGroupAsRead(activeGroup?.id ?? null);
  }, [activeGroup?.id, markGroupAsRead]);

  useEffect(() => {
    if (!readCountsReady) return;
    const hasUnread =
      Object.values(incomingCounts).some((count) => count > 0) ||
      Object.values(groupIncomingCounts).some((count) => count > 0);
    saveUnreadFlag(EMPLOYER_SCOPE, hasUnread);
  }, [incomingCounts, groupIncomingCounts, readCountsReady]);

  useEffect(() => {
    if (!readCountsReady) return;
    if (!currentUserId || conversations.length === 0) {
      dmTotalsRef.current = {};
      setIncomingCounts({});
      return;
    }

    let cancelled = false;

    async function loadIncomingCounts() {
      const peerIds = Array.from(
        new Set(conversations.map((conv) => conv.peer.id)),
      );

      if (peerIds.length === 0) {
        dmTotalsRef.current = {};
        if (!cancelled) setIncomingCounts({});
        return;
      }

      const { data, error } = await supabase
        .from("message")
        .select("sender_id")
        .eq("recipient_id", currentUserId)
        .in("sender_id", peerIds);

      if (cancelled) return;

      if (error) {
        console.error("Error loading incoming DM counts:", error);
        return;
      }

      const totals: Record<string, number> = {};
      const unread: Record<string, number> = {};
      const occurrences: Record<string, number> = {};

      for (const row of (data ?? []) as { sender_id: string | null }[]) {
        if (!row.sender_id) continue;
        occurrences[row.sender_id] = (occurrences[row.sender_id] ?? 0) + 1;
      }

      Object.entries(occurrences).forEach(([senderId, total]) => {
        totals[senderId] = total;
        const readCount = dmReadCountsRef.current[senderId] ?? 0;
        const diff = total - readCount;
        if (diff > 0) {
          unread[senderId] = diff;
        }
      });
      peerIds.forEach((peerId) => {
        if (totals[peerId] === undefined) {
          totals[peerId] = 0;
        }
      });

      dmTotalsRef.current = totals;
      if (!cancelled) {
        setIncomingCounts(unread);
      }
    }

    loadIncomingCounts();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, conversations, readCountsReady]);

  useEffect(() => {
    if (!readCountsReady) return;
    if (!currentUserId || groups.length === 0) {
      groupTotalsRef.current = {};
      setGroupIncomingCounts({});
      return;
    }

    let cancelled = false;

    async function loadGroupCounts() {
      const groupIds = groups.map((group) => group.id);
      if (groupIds.length === 0) {
        groupTotalsRef.current = {};
        if (!cancelled) setGroupIncomingCounts({});
        return;
      }
      const { data, error } = await supabase
        .from("group_message")
        .select("group_id")
        .in("group_id", groupIds)
        .neq("sender_id", currentUserId);

      if (cancelled) return;

      if (error) {
        console.error("Error loading group message counts:", error);
        return;
      }

      const totals: Record<string, number> = {};
      const unread: Record<string, number> = {};
      const occurrences: Record<string, number> = {};

      for (const row of (data ?? []) as { group_id: string | null }[]) {
        if (!row.group_id) continue;
        occurrences[row.group_id] = (occurrences[row.group_id] ?? 0) + 1;
      }

      Object.entries(occurrences).forEach(([groupId, total]) => {
        totals[groupId] = total;
        const readCount = groupReadCountsRef.current[groupId] ?? 0;
        const diff = total - readCount;
        if (diff > 0) {
          unread[groupId] = diff;
        }
      });

      groupIds.forEach((groupId) => {
        if (totals[groupId] === undefined) {
          totals[groupId] = 0;
        }
      });

      groupTotalsRef.current = totals;
      if (!cancelled) {
        setGroupIncomingCounts(unread);
      }
    }

    loadGroupCounts();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, groups, readCountsReady]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`incoming-dm-counts:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          const newRow = payload.new as MessageRow;
          if (!newRow?.sender_id || newRow.sender_id === currentUserId) {
            return;
          }
          const senderId = newRow.sender_id;
          const existingTotal = dmTotalsRef.current[senderId] ?? dmReadCountsRef.current[senderId] ?? 0;
          const nextTotal = existingTotal + 1;
          dmTotalsRef.current[senderId] = nextTotal;
          const readCount = dmReadCountsRef.current[senderId] ?? 0;
          const unreadCount = Math.max(nextTotal - readCount, 0);
          setIncomingCounts((prev) => {
            if (unreadCount === 0) {
              if (!prev[senderId]) return prev;
              const clone = { ...prev };
              delete clone[senderId];
              return clone;
            }
            return { ...prev, [senderId]: unreadCount };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId]);

  useEffect(() => {
    if (!currentUserId || groups.length === 0) return;

    const groupIds = new Set(groups.map((group) => group.id));

    const channel = supabase
      .channel(`incoming-group-counts:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_message",
        },
        (payload) => {
          const newRow = payload.new as GroupMessageRow;
          if (!newRow?.group_id || newRow.sender_id === currentUserId) {
            return;
          }
          if (!groupIds.has(newRow.group_id)) {
            return;
          }
          const groupId = newRow.group_id;
          const existingTotal = groupTotalsRef.current[groupId] ?? groupReadCountsRef.current[groupId] ?? 0;
          const nextTotal = existingTotal + 1;
          groupTotalsRef.current[groupId] = nextTotal;
          const readCount = groupReadCountsRef.current[groupId] ?? 0;
          const unreadCount = Math.max(nextTotal - readCount, 0);
          setGroupIncomingCounts((prev) => {
            if (unreadCount === 0) {
              if (!prev[groupId]) return prev;
              const clone = { ...prev };
              delete clone[groupId];
              return clone;
            }
            return { ...prev, [groupId]: unreadCount };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, groups]);

  // Load current user
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      setLoadingUser(true);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !user) {
        setCurrentUserId(null);
      } else {
        setCurrentUserId(user.id as UUID);
      }
      setLoadingUser(false);
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!currentUserId) {
      setSelfProfile(null);
      return;
    }

    let cancelled = false;
    const userId = currentUserId;

    async function loadSelfProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, email, photo_url")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Error loading employer profile:", error);
        setSelfProfile({
          id: userId,
          display_name: null,
          full_name: null,
          email: null,
          photo_url: null,
        });
        return;
      }

      if (data) {
        setSelfProfile(data as Profile);
      } else {
        setSelfProfile({
          id: userId,
          display_name: null,
          full_name: null,
          email: null,
          photo_url: null,
        });
      }
    }

    loadSelfProfile();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  // Determine which businesses this employer can manage
  useEffect(() => {
    if (!currentUserId) {
      setManagedBusinessIds([]);
      setBusinessScopeChecked(false);
      return;
    }

    let cancelled = false;

    async function loadBusinessScope() {
      const ids = new Set<UUID>();
      try {
        const { data: employmentRows, error: employmentError } = await supabase
          .from("employment")
          .select("business_id")
          .eq("user_id", currentUserId)
          .eq("status", "active");

        if (!cancelled && employmentError) {
          console.error("Error loading employment scope:", employmentError);
        }

        if (!employmentError && employmentRows) {
          employmentRows.forEach((row) => {
            if (row.business_id) {
              ids.add(row.business_id as UUID);
            }
          });
        }

        const { data: ownedRows, error: ownedError } = await supabase
          .from("business")
          .select("id")
          .eq("owner_user_id", currentUserId);

        if (!cancelled && ownedError) {
          console.error("Error loading owned businesses:", ownedError);
        }

        if (!ownedError && ownedRows) {
          ownedRows.forEach((row) => {
            if (row.id) {
              ids.add(row.id as UUID);
            }
          });
        }

        if (!cancelled) {
          setManagedBusinessIds(Array.from(ids));
          setBusinessScopeChecked(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error determining business scope:", err);
          setManagedBusinessIds([]);
          setBusinessScopeChecked(true);
        }
      }
    }

    loadBusinessScope();

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  // Load role/location lookups for managed businesses
  useEffect(() => {
    if (!businessScopeChecked || managedBusinessIds.length === 0) {
      setRoleLookup({});
      setLocationLookup({});
      return;
    }

    let cancelled = false;

    async function loadLookups() {
      try {
        const [roleRes, locationRes] = await Promise.all([
          supabase
            .from("role")
            .select("id,name")
            .in("business_id", managedBusinessIds)
            .order("name", { ascending: true }),
          supabase
            .from("location")
            .select("id,name")
            .in("business_id", managedBusinessIds)
            .order("name", { ascending: true }),
        ]);

        if (cancelled) return;

        if (!roleRes.error && roleRes.data) {
          const nextRoles: Record<UUID, string> = {};
          (roleRes.data as { id: UUID; name: string | null }[]).forEach((row) => {
            nextRoles[row.id] = (row.name ?? "").trim();
          });
          setRoleLookup(nextRoles);
        } else if (roleRes.error) {
          console.error("Error loading role lookup:", roleRes.error);
          setRoleLookup({});
        }

        if (!locationRes.error && locationRes.data) {
          const nextLocations: Record<UUID, string> = {};
          (locationRes.data as { id: UUID; name: string | null }[]).forEach((row) => {
            nextLocations[row.id] = (row.name ?? "").trim();
          });
          setLocationLookup(nextLocations);
        } else if (locationRes.error) {
          console.error("Error loading location lookup:", locationRes.error);
          setLocationLookup({});
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error building role/location lookups:", err);
          setRoleLookup({});
          setLocationLookup({});
        }
      }
    }

    loadLookups();

    return () => {
      cancelled = true;
    };
  }, [supabase, managedBusinessIds, businessScopeChecked]);

  // Load contacts scoped to managed businesses
  useEffect(() => {
    if (!currentUserId || !businessScopeChecked) return;

    if (managedBusinessIds.length === 0) {
      setContacts([]);
      setConversations([]);
      setEmploymentMetaByUserId({});
      setIsLoadingContacts(false);
      return;
    }

    let cancelled = false;

    async function loadContacts() {
      setIsLoadingContacts(true);
      try {
        const { data: employmentRows, error: employmentError } = await supabase
          .from("employment")
          .select("id,user_id,business_id,role_id,location_id")
          .in("business_id", managedBusinessIds)
          .eq("status", "active");

        if (employmentError) {
          throw employmentError;
        }

        const typedEmploymentRows = (employmentRows ?? []) as Array<{
          id: UUID | null;
          user_id: UUID | null;
          business_id: UUID | null;
          role_id: UUID | null;
          location_id: UUID | null;
        }>;

        const rosterIds = Array.from(
          new Set(
            typedEmploymentRows
              .map((row) => row.user_id as UUID)
              .filter((id) => Boolean(id) && id !== currentUserId),
          ),
        );

        const employmentIds = typedEmploymentRows
          .map((row) => row.id)
          .filter((id): id is UUID => Boolean(id)) as UUID[];

        const roleAssignmentsByEmployment = new Map<UUID, UUID[]>();
        if (employmentIds.length) {
          const { data: roleAssignmentRows, error: roleAssignmentError } = await supabase
            .from("employment_roles")
            .select("employment_id,role_id")
            .in("employment_id", employmentIds);

          if (roleAssignmentError) {
            if ((roleAssignmentError as PostgrestError)?.code !== "42P01") {
              throw roleAssignmentError;
            }
          } else {
            for (const assignment of (roleAssignmentRows ?? []) as Array<{ employment_id: UUID; role_id: UUID | null }>) {
              if (!assignment.role_id) continue;
              const bucket = roleAssignmentsByEmployment.get(assignment.employment_id) ?? [];
              roleAssignmentsByEmployment.set(assignment.employment_id, [...bucket, assignment.role_id]);
            }
          }
        }

        if (rosterIds.length === 0) {
          if (!cancelled) {
            setContacts([]);
            setConversations([]);
            setEmploymentMetaByUserId({});
            setIsLoadingContacts(false);
          }
          return;
        }

        let profileRows: Profile[] = [];
        const profileQuery = await supabase
          .from("profiles")
          .select("id, display_name, full_name, email, photo_url, profile_title")
          .in("id", rosterIds)
          .order("full_name", { ascending: true });

        if (profileQuery.error) {
          if ((profileQuery.error as PostgrestError).code === "42703") {
            const fallback = await supabase
              .from("profiles")
              .select("id, display_name, full_name, email, photo_url")
              .in("id", rosterIds)
              .order("full_name", { ascending: true });
            if (fallback.error) {
              throw fallback.error;
            }
            profileRows = (fallback.data ?? []) as Profile[];
          } else {
            throw profileQuery.error;
          }
        } else {
          profileRows = (profileQuery.data ?? []) as Profile[];
        }

        const employmentMeta: Record<UUID, EmploymentSnapshot> = {};
        typedEmploymentRows.forEach((row) => {
          if (!row.user_id) return;
          const employmentId = row.id as UUID | null;
          const roleSet = new Set<UUID>();
          if (row.role_id) {
            roleSet.add(row.role_id);
          }
          if (employmentId) {
            const assigned = roleAssignmentsByEmployment.get(employmentId) ?? [];
            assigned.forEach((roleId) => roleSet.add(roleId));
          }
          employmentMeta[row.user_id as UUID] = {
            employmentId,
            businessId: (row.business_id as UUID) ?? null,
            primaryRoleId: (row.role_id as UUID) ?? null,
            roleIds: Array.from(roleSet),
            locationId: (row.location_id as UUID) ?? null,
          };
        });

        if (!cancelled) {
          const roster = profileRows;
          setContacts(roster);
          setEmploymentMetaByUserId(employmentMeta);
          setConversations((prev) => {
            if (prev.length === 0) {
              return roster.map((peer) => ({ peer, lastMessage: null }));
            }

            const refreshed = prev
              .map((conv) => {
                const updatedPeer = roster.find((profile) => profile.id === conv.peer.id);
                if (updatedPeer) {
                  return { ...conv, peer: updatedPeer };
                }
                return conv;
              })
              .filter(Boolean);

            return refreshed.length
              ? refreshed
              : roster.map((peer) => ({ peer, lastMessage: null }));
          });
          setActivePeer((prev) => {
            if (prev && roster.some((profile) => profile.id === prev.id)) {
              return prev;
            }
            if (activeGroupRef.current) {
              return null;
            }
            return roster[0] ?? null;
          });
          setIsLoadingContacts(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading contacts:", err);
          setContacts([]);
          setConversations([]);
          setEmploymentMetaByUserId({});
          setIsLoadingContacts(false);
        }
      }
    }

    loadContacts();

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, managedBusinessIds, businessScopeChecked]);

  // Load groups the current user belongs to
  useEffect(() => {
    if (!currentUserId) {
      setGroups([]);
      return;
    }

    let cancelled = false;

    async function loadGroups() {
      setIsLoadingGroups(true);
      try {
        const { data: groupMembershipRows, error: groupMembershipError } = await supabase
          .from("group_thread_member")
          .select("group_id, user_id, group:group_thread(id, name, created_by)")
          .eq("user_id", currentUserId);

        if (groupMembershipError) {
          throw groupMembershipError;
        }

        const typedMembershipRows = (groupMembershipRows ?? []) as unknown as Array<{
          group_id: UUID;
          user_id: UUID;
          group: { id: UUID; name: string | null; created_by: UUID | null } | null;
        }>;

        const groupMeta = new Map<UUID, { name: string; createdBy: UUID | null }>();
        typedMembershipRows.forEach((row) => {
          const group = row.group;
          if (group?.id) {
            groupMeta.set(group.id, {
              name: group.name ?? "Group",
              createdBy: group.created_by ?? null,
            });
          }
        });

        const groupIds = Array.from(groupMeta.keys());
        if (groupIds.length === 0) {
          if (!cancelled) {
            setGroups([]);
            setIsLoadingGroups(false);
          }
          return;
        }

        const { data: memberRows, error: memberError } = await supabase
          .from("group_thread_member")
          .select("group_id, user_id")
          .in("group_id", groupIds);

        if (memberError) {
          throw memberError;
        }

        const membersByGroup = new Map<UUID, Set<UUID>>();
        const typedMemberRows = (memberRows ?? []) as unknown as Array<{ group_id: UUID; user_id: UUID }>;
        typedMemberRows.forEach((row) => {
          const groupId = row.group_id;
          const userId = row.user_id;
          if (!groupId || !userId) return;
          const bucket = membersByGroup.get(groupId) ?? new Set<UUID>();
          bucket.add(userId);
          membersByGroup.set(groupId, bucket);
        });

        const hydratedGroups: GroupChat[] = groupIds.map((groupId) => {
          const meta = groupMeta.get(groupId);
          const members = Array.from(membersByGroup.get(groupId) ?? new Set<UUID>());
          return {
            id: groupId,
            name: meta?.name ?? "Group",
            createdBy: meta?.createdBy,
            memberIds: members,
          };
        });

        if (!cancelled) {
          setGroups(hydratedGroups);
          setActiveGroup((prev) => {
            if (!prev) return prev;
            return hydratedGroups.find((group) => group.id === prev.id) ?? null;
          });
          setIsLoadingGroups(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading groups:", err);
          setGroups([]);
          setActiveGroup((prev) => (prev ? null : prev));
          setIsLoadingGroups(false);
        }
      }
    }

    loadGroups();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  

  // Load messages for active peer or group
  useEffect(() => {
    if (!currentUserId) return;
    if (!activePeer && !activeGroup) {
      setMessages([]);
      setInitialMessagesLoaded(false);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      setIsLoadingMessages(true);

      try {
        if (activePeer) {
          const participantA = currentUserId;
          const participantB = activePeer.id;
          const { data, error } = await supabase
            .from("message")
            .select("*")
            .in("sender_id", [participantA, participantB])
            .in("recipient_id", [participantA, participantB])
            .order("created_at", { ascending: true })
            .limit(200);

          if (error) {
            throw error;
          }

          if (!cancelled) {
            const rows = ((data ?? []) as MessageRow[]).map((row) => ({
              ...row,
              kind: "dm" as const,
            }));
            setMessages(rows);
          }
        } else if (activeGroup) {
          const { data, error } = await supabase
            .from("group_message")
            .select("*")
            .eq("group_id", activeGroup.id)
            .order("created_at", { ascending: true })
            .limit(200);

          if (error) {
            throw error;
          }

          if (!cancelled) {
            const rows = ((data ?? []) as GroupMessageRow[]).map((row) => ({
              ...row,
              kind: "group" as const,
            }));
            setMessages(rows);
          }
        }
      } catch (err) {
        console.error("Error loading messages:", err);
        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setInitialMessagesLoaded(true);
          setIsLoadingMessages(false);
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, activePeer?.id, activeGroup?.id]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!isActionMenuOpen) return;
      const target = event.target as Node;
      const anchor = actionMenuAnchorRef.current;
      const panel = actionMenuPanelRef.current;
      if (!anchor || !panel) return;
      if (!panel.contains(target) && !anchor.contains(target)) {
        setIsActionMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [isActionMenuOpen]);

  useEffect(() => {
    function handleAddMenuClick(event: MouseEvent) {
      if (!isAddContactOpen) return;
      const target = event.target as Node;
      if (
        addContactPanelRef.current &&
        addContactAnchorRef.current &&
        !addContactPanelRef.current.contains(target) &&
        !addContactAnchorRef.current.contains(target)
      ) {
        setIsAddContactOpen(false);
        setAddContactSearch("");
      }
    }

    document.addEventListener("mousedown", handleAddMenuClick);
    return () => {
      document.removeEventListener("mousedown", handleAddMenuClick);
    };
  }, [isAddContactOpen]);

  useEffect(() => {
    setIsActionMenuOpen(false);
    setScheduleModalState(null);
  }, [activePeer?.id, activeGroup?.id]);

  // Realtime messages + typing indicator
  useEffect(() => {
    if (!currentUserId) return undefined;

    if (activePeer) {
      const channelName = dmChannelName(currentUserId, activePeer.id);

      const appendIncomingDm = (incoming: MessageRow) => {
        const participants = [incoming.sender_id, incoming.recipient_id];
        if (!participants.includes(currentUserId) || !participants.includes(activePeer.id)) {
          return;
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, { ...incoming, kind: "dm" }];
        });
      };

      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message",
          },
          (payload) => {
            const newRow = payload.new as MessageRow;
            appendIncomingDm(newRow);
          },
        )
        .on("broadcast", { event: "message" }, ({ payload }) => {
          appendIncomingDm(payload as MessageRow);
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const { senderId } = payload as { senderId: UUID };
          if (senderId === currentUserId) return;

          setIsPeerTyping(true);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(
            () => setIsPeerTyping(false),
            3000,
          );
        })
        .subscribe();

      channelRef.current = channel;

      return () => {
        setIsPeerTyping(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }

    if (activeGroup) {
      const channelName = groupChannelName(activeGroup.id);

      const appendIncomingGroup = (incoming: GroupMessageRow) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, { ...incoming, kind: "group" }];
        });
      };

      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_message",
            filter: `group_id=eq.${activeGroup.id}`,
          },
          (payload) => {
            const newRow = payload.new as GroupMessageRow;
            appendIncomingGroup(newRow);
          },
        )
        .subscribe();

      channelRef.current = channel;

      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }

    return undefined;
  }, [supabase, currentUserId, activePeer, activeGroup, t]);

  useEffect(() => {
    if (!messages.length) {
      setRequestStatusMap({});
      return;
    }

    const forwardCards = messages
      .map((msg) => parseForwardCard(msg.content))
      .filter((card): card is ForwardCardPayload => Boolean(card));

    if (forwardCards.length === 0) {
      setRequestStatusMap({});
      return;
    }

    const timeOffIds = Array.from(
      new Set(
        forwardCards
          .filter((card) => card.requestType === "timeOff")
          .map((card) => card.requestId),
      ),
    );
    const availabilityIds = Array.from(
      new Set(
        forwardCards
          .filter((card) => card.requestType === "availability")
          .map((card) => card.requestId),
      ),
    );

    let cancelled = false;

    async function loadForwardStatuses() {
      const next: Record<string, string> = {};
      try {
        if (timeOffIds.length) {
          const { data, error } = await supabase
            .from("time_off_request")
            .select("id,status")
            .in("id", timeOffIds);

          if (error) throw error;

          for (const row of (data ?? []) as Array<{
            id: string;
            status: string | null;
          }>) {
            if (row.id) {
              next[row.id] = row.status ?? "pending";
            }
          }
        }

        if (availabilityIds.length) {
          const { data, error } = await supabase
            .from("availability")
            .select("id,status")
            .in("id", availabilityIds);

          if (error) throw error;

          for (const row of (data ?? []) as Array<{
            id: string;
            status: string | null;
          }>) {
            if (row.id) {
              next[row.id] = row.status ?? "pending";
            }
          }
        }

        if (!cancelled) {
          setRequestStatusMap(next);
        }
      } catch (err) {
        console.error("Error loading forwarded request statuses:", err);
      }
    }

    loadForwardStatuses();

    return () => {
      cancelled = true;
    };
  }, [messages, supabase]);

  useEffect(() => {
    if (!decisionFeedback) return;
    const delay = Math.max(0, decisionFeedback.expiresAt - Date.now());
    const timer = setTimeout(() => {
      setDecisionFeedback(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [decisionFeedback]);

  const modalWeekKey = scheduleModalState?.payload.weekKey ?? null;
  const modalEmployeeId = scheduleModalState?.employeeId ?? null;

  useEffect(() => {
    if (!scheduleModalState || !modalWeekKey || !modalEmployeeId) {
      setScheduleEditorDays([]);
      setScheduleEditorError(null);
      setScheduleEditorSuccess(null);
      setIsScheduleEditorLoading(false);
      setIsScheduleEditorSaving(false);
      return;
    }

    let cancelled = false;

    async function loadSingleUserSchedule() {
      setIsScheduleEditorLoading(true);
      setScheduleEditorError(null);

      try {
        const weekStart = new Date(`${modalWeekKey}T00:00:00`);
        if (Number.isNaN(weekStart.getTime())) {
          throw new Error("Invalid week reference inside this schedule card.");
        }

        const baseDays: ScheduleEditorDay[] = Array.from({ length: 7 }, (_, idx) => {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + idx);
          const dateISO = toLocalYMD(date);
          return {
            dayIndex: idx,
            dateISO,
            label: humanizeDateLabel(dateISO),
            works: false,
            startTime: DEFAULT_SHIFT_START,
            endTime: DEFAULT_SHIFT_END,
            shiftId: null,
            assignmentId: null,
            status: null,
            roleId: null,
            locationId: null,
            businessId: null,
          };
        });

        const { data: employmentRow, error: employmentError } = await supabase
          .from("employment")
          .select("business_id,location_id,role_id")
          .eq("user_id", modalEmployeeId)
          .eq("status", "active")
          .maybeSingle();

        if (employmentError) {
          console.error("Error loading employment metadata:", employmentError);
        }

        const defaultBusinessId = (employmentRow?.business_id as string | null) ?? null;
        const defaultRoleId = (employmentRow?.role_id as string | null) ?? null;
        const defaultLocationId = (employmentRow?.location_id as string | null) ?? null;

        const { data: assignmentRows, error: assignmentError } = await supabase
          .from("shift_assignment")
          .select("id,shift_id")
          .eq("user_id", modalEmployeeId);

        if (assignmentError) {
          throw assignmentError;
        }

        const typedAssignments = (assignmentRows ?? []).filter(
          (row): row is { id: string; shift_id: string } => Boolean(row.shift_id),
        );
        const assignmentByShiftId: Record<string, string> = {};
        for (const row of typedAssignments) {
          assignmentByShiftId[row.shift_id] = row.id;
        }
        const shiftIds = typedAssignments.map((row) => row.shift_id);

        const weekStartISO = new Date(`${baseDays[0].dateISO}T00:00:00`).toISOString();
        const weekEndDate = new Date(`${baseDays[0].dateISO}T00:00:00`);
        weekEndDate.setDate(weekEndDate.getDate() + 7);
        const weekEndISO = weekEndDate.toISOString();

        let shiftRows: Array<{
          id: string;
          start_ts: string;
          end_ts: string;
          status: string | null;
          role_id: string | null;
          location_id: string | null;
          business_id: string | null;
        }> = [];

        if (shiftIds.length) {
          const { data: shiftData, error: shiftError } = await supabase
            .from("shift")
            .select("id,start_ts,end_ts,status,role_id,location_id,business_id")
            .in("id", shiftIds)
            .gte("start_ts", weekStartISO)
            .lt("start_ts", weekEndISO);

          if (shiftError) {
            throw shiftError;
          }

          shiftRows = (shiftData ?? []) as typeof shiftRows;
        }

        const shiftByDate: Record<string, (typeof shiftRows)[number]> = {};
        for (const shift of shiftRows) {
          const dateKey = toLocalYMD(new Date(shift.start_ts));
          if (!shiftByDate[dateKey]) {
            shiftByDate[dateKey] = shift;
          }
        }

        const resolvedDays = baseDays.map((day) => {
          const shift = shiftByDate[day.dateISO];
          if (!shift) {
            return {
              ...day,
              roleId: day.roleId ?? defaultRoleId,
              locationId: day.locationId ?? defaultLocationId,
              businessId: day.businessId ?? defaultBusinessId,
            };
          }

          return {
            ...day,
            works: true,
            startTime: isoToTimeInput(shift.start_ts),
            endTime: isoToTimeInput(shift.end_ts),
            shiftId: shift.id,
            assignmentId: assignmentByShiftId[shift.id] ?? null,
            status: shift.status ?? null,
            roleId: shift.role_id ?? defaultRoleId,
            locationId: shift.location_id ?? defaultLocationId,
            businessId: shift.business_id ?? defaultBusinessId,
          };
        });

        if (!cancelled) {
          setScheduleEditorDays(resolvedDays);
        }
      } catch (err) {
        console.error("Error loading single-user schedule:", err);
        if (!cancelled) {
          setScheduleEditorError(
            err instanceof Error
              ? err.message
              : "Unable to load this employee schedule. Please try again.",
          );
          setScheduleEditorDays([]);
        }
      } finally {
        if (!cancelled) {
          setIsScheduleEditorLoading(false);
        }
      }
    }

    loadSingleUserSchedule();
    return () => {
      cancelled = true;
    };
  }, [scheduleModalState, modalWeekKey, modalEmployeeId, supabase, scheduleEditorReloadKey]);

  const scheduleEditorPreviewPayload = useMemo(() => {
    if (!scheduleModalState) return null;
    if (!scheduleEditorDays.length) return scheduleModalState.payload;

    const slots = scheduleEditorDays
      .filter((day) => day.works)
      .map((day) => {
        const date = new Date(`${day.dateISO}T00:00:00`);
        const dayLabel = date.toLocaleDateString([], { weekday: "short" });
        const fallbackTitle =
          scheduleModalState.payload.slots.find((slot) => slot.day === dayLabel)?.title ??
          "Shift";
        return {
          day: dayLabel,
          time: `${formatTimeLabel(day.startTime)} – ${formatTimeLabel(day.endTime)}`,
          title: fallbackTitle,
        };
      });

    return {
      ...scheduleModalState.payload,
      slots,
      summary: slots.length
        ? slots.map((slot) => `• ${slot.day} ${slot.time} – ${slot.title}`).join("\n")
        : "No shifts scheduled for this week.",
    } as ScheduleCardPayload;
  }, [scheduleModalState, scheduleEditorDays]);

  const unaddedContacts = useMemo(() => {
    const existingIds = new Set(conversations.map((conv) => conv.peer.id));
    return contacts.filter((profile) => !existingIds.has(profile.id));
  }, [contacts, conversations]);

  const addContactResults = useMemo(() => {
    const query = addContactSearch.trim().toLowerCase();
    const source = unaddedContacts;
    if (!query) return source;
    return source.filter((profile) => {
      const haystack = `${profileDisplayName(profile, "")} ${profile.email ?? ""}`
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [unaddedContacts, addContactSearch]);

  const groupDraftSelectionCount = useMemo(() => {
    return Object.values(groupDraftMembers).filter(Boolean).length;
  }, [groupDraftMembers]);

  const profileById = useMemo(() => {
    const map = new Map<UUID, Profile>();
    contacts.forEach((profile) => {
      map.set(profile.id, profile);
    });

    if (selfProfile) {
      map.set(selfProfile.id, selfProfile);
    } else if (currentUserId && !map.has(currentUserId)) {
      map.set(currentUserId, {
        id: currentUserId,
        display_name: "You",
        full_name: "You",
        email: null,
        photo_url: null,
      });
    }

    return map;
  }, [contacts, currentUserId, selfProfile]);

  const displayedMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = new Date();

    return messages.filter((m) => {
      if (q && !m.content.toLowerCase().includes(q)) return false;

      if (dateFilter === "today") {
        const d = new Date(m.created_at);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      }

      if (dateFilter === "7days") {
        const d = new Date(m.created_at);
        const diff = now.getTime() - d.getTime();
        return diff <= 7 * 24 * 60 * 60 * 1000;
      }

      return true;
    });
  }, [messages, searchQuery, dateFilter]);

  const activePeerResolvedName = useMemo(() => {
    if (!activePeer) return null;
    const resolved = profileDisplayName(activePeer, activePeer.email ?? "");
    return resolved || activePeer.email || null;
  }, [activePeer]);

  const activePeerEmploymentMeta = activePeer ? employmentMetaByUserId[activePeer.id] ?? null : null;

  const activePeerRoleNames = useMemo(() => {
    if (!activePeerEmploymentMeta) return [] as string[];
    const names = (activePeerEmploymentMeta.roleIds ?? [])
      .map((roleId) => roleLookup[roleId])
      .filter((name): name is string => Boolean(name && name.trim()));
    if (!names.length && activePeerEmploymentMeta.primaryRoleId) {
      const fallback = roleLookup[activePeerEmploymentMeta.primaryRoleId];
      if (fallback) {
        return [fallback];
      }
    }
    return names;
  }, [activePeerEmploymentMeta, roleLookup]);

  const activePeerLocationName = useMemo(() => {
    if (!activePeerEmploymentMeta?.locationId) return null;
    const label = locationLookup[activePeerEmploymentMeta.locationId];
    return label && label.trim() ? label : null;
  }, [activePeerEmploymentMeta?.locationId, locationLookup]);

  const activePeerBio = useMemo(() => {
    if (!activePeer) return null;
    const explicit = typeof activePeer.profile_title === "string" ? activePeer.profile_title.trim() : "";
    if (explicit) return explicit;
    const name = profileDisplayName(activePeer, activePeer.email ?? "This teammate") || "This teammate";
    if (activePeerRoleNames.length && activePeerLocationName) {
      return `${name} works as ${activePeerRoleNames.join(", ")} at ${activePeerLocationName}.`;
    }
    if (activePeerRoleNames.length) {
      return `${name} works as ${activePeerRoleNames.join(", ")}.`;
    }
    if (activePeerLocationName) {
      return `${name} is based at ${activePeerLocationName}.`;
    }
    return null;
  }, [activePeer, activePeerRoleNames, activePeerLocationName]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) return;
    if (!activePeer && !activeGroup) return;
    const content = newMessage.trim();
    if (!content) return;

    setNewMessage("");
    setSending(true);

    try {
      if (activeGroup) {
        await sendGroupMessage(content);
      } else if (activePeer) {
        await sendDirectMessage(content);
      }
    } finally {
      setSending(false);
    }
  }

  async function sendDirectMessage(content: string) {
    if (!currentUserId || !activePeer) return;

    const tempId = `temp-dm-${Date.now().toString(36)}`;
    const optimisticMessage: ConversationMessage = {
      id: tempId,
      sender_id: currentUserId,
      recipient_id: activePeer.id,
      content,
      created_at: new Date().toISOString(),
      kind: "dm",
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      // eslint-disable-next-line no-console
      console.log(
        "Sending DM: currentUserId=",
        currentUserId,
        "sessionUserId=",
        sessionData?.session?.user?.id,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to read session before DM send", err);
    }

    const { data, error } = await supabase
      .from("message")
      .insert({
        sender_id: currentUserId,
        recipient_id: activePeer.id,
        content,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error sending direct message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return;
    }

    if (data) {
      const savedMessage: ConversationMessage = {
        ...(data as MessageRow),
        kind: "dm",
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? savedMessage : m)),
      );

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "message",
          payload: data,
        });
      }
    }
  }

  async function sendGroupMessage(content: string) {
    if (!currentUserId || !activeGroup) return;

    const tempId = `temp-group-${Date.now().toString(36)}`;
    const optimisticMessage: ConversationMessage = {
      id: tempId,
      sender_id: currentUserId,
      group_id: activeGroup.id,
      content,
      created_at: new Date().toISOString(),
      kind: "group",
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      // eslint-disable-next-line no-console
      console.log(
        "Sending group message: currentUserId=",
        currentUserId,
        "sessionUserId=",
        sessionData?.session?.user?.id,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to read session before group send", err);
    }

    const { data, error } = await supabase
      .from("group_message")
      .insert({
        group_id: activeGroup.id,
        sender_id: currentUserId,
        content,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error sending group message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return;
    }

    if (data) {
      const savedMessage: ConversationMessage = {
        ...(data as GroupMessageRow),
        kind: "group",
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? savedMessage : m)),
      );
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNewMessage(e.target.value);

    if (!currentUserId || !activePeer) return;
    const channel = channelRef.current;
    if (!channel) return;

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { senderId: currentUserId },
    });
  }

  function openForwardAction(
    card: ForwardCardPayload,
    action: "approve" | "deny",
  ) {
    setForwardActionError(null);
    setForwardActionState({ card, action });
  }

  function closeForwardAction() {
    if (isForwardActionLoading) return;
    setForwardActionState({ card: null, action: null });
    setForwardActionError(null);
  }

  async function handleForwardDecision() {
    const { card, action } = forwardActionState;
    if (!card || !action || !currentUserId) {
      return;
    }
    setIsForwardActionLoading(true);
    setForwardActionError(null);
    const status = action === "approve" ? "approved" : "denied";
    const table = card.requestType === "timeOff" ? "time_off_request" : "availability";
    try {
      const { error } = await supabase
        .from(table)
        .update({
          status,
          decided_by: currentUserId,
          decided_at: new Date().toISOString(),
        })
        .eq("id", card.requestId);

      if (error) {
        throw error;
      }

      setRequestStatusOverrides((prev) => ({
        ...prev,
        [card.requestId]: status,
      }));
      setRequestStatusMap((prev) => ({
        ...prev,
        [card.requestId]: status,
      }));
      setDecisionFeedback({
        requestId: card.requestId,
        status,
        requestType: card.requestType,
        rangeLabel: card.rangeLabel,
        expiresAt: Date.now() + DECISION_FEEDBACK_TTL_MS,
      });
      setForwardActionState({ card: null, action: null });
    } catch (err) {
      console.error("Error updating forwarded request:", err);
      setForwardActionError("Unable to update the request. Please try again.");
    } finally {
      setIsForwardActionLoading(false);
    }
  }

  function insertTemplate(template: string) {
    setNewMessage((prev) => (prev ? `${prev}\n\n${template}` : template));
    setIsActionMenuOpen(false);
  }

  function handleSendButtonContextMenu(
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    if (!activePeer) return;
    event.preventDefault();
    setIsActionMenuOpen(true);
  }

  function toggleActionMenu() {
    if (!activePeer) return;
    setIsActionMenuOpen((prev) => !prev);
  }

  function handleScheduleModifyClick(payload: ScheduleCardPayload) {
    if (!activePeer) return;
    setScheduleModalState({
      payload,
      employeeName: activePeerResolvedName || "Employee",
      employeeId: activePeer.id,
    });
  }

  function handleSelectContact(peer: Profile) {
    setIsAddContactOpen(false);
    setAddContactSearch("");
    setActiveGroup(null);
    setConversations((prev) => {
      const existingIndex = prev.findIndex((conv) => conv.peer.id === peer.id);
      if (existingIndex >= 0) {
        const reordered = [...prev];
        const [existing] = reordered.splice(existingIndex, 1);
        return [existing, ...reordered];
      }
      return [{ peer, lastMessage: null }, ...prev];
    });
    setActivePeer(peer);
  }

  function handleSelectGroup(group: GroupChat) {
    setActivePeer(null);
    setActiveGroup(group);
    setIsAddContactOpen(false);
    setAddContactSearch("");
    setIsActionMenuOpen(false);
  }

  function toggleGroupDraftMember(userId: UUID) {
    setGroupDraftMembers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }

  function toggleGroupBuilder() {
    setIsGroupBuilderOpen((prev) => {
      if (prev) {
        setGroupDraftMembers({});
        setGroupDraftName("");
        setGroupBuilderError(null);
        setIsCreatingGroup(false);
      }
      return !prev;
    });
  }

  async function handleCreateGroup() {
    if (!currentUserId) {
      setGroupBuilderError("You must be signed in to create a group chat.");
      return;
    }

    const trimmedName = groupDraftName.trim();
    if (!trimmedName) {
      setGroupBuilderError("Name your group to continue.");
      return;
    }

    const teammateIds = Object.entries(groupDraftMembers)
      .filter(([, selected]) => Boolean(selected))
      .map(([id]) => id as UUID);

    if (teammateIds.length < 2) {
      setGroupBuilderError("Pick at least two teammates in addition to you.");
      return;
    }

    const memberSet = new Set<UUID>([currentUserId, ...teammateIds]);
    const memberIds = Array.from(memberSet);

    setIsCreatingGroup(true);
    setGroupBuilderError(null);

    try {
      const { data: groupRow, error: groupError } = await supabase
        .from("group_thread")
        .insert({
          name: trimmedName,
          created_by: currentUserId,
        })
        .select("id, name, created_by")
        .single();

      if (groupError) {
        throw groupError;
      }

      if (!groupRow?.id) {
        throw new Error("Group creation succeeded without returning an id.");
      }

      const membershipPayload = memberIds.map((userId) => ({
        group_id: groupRow.id as UUID,
        user_id: userId,
        added_by: currentUserId,
      }));

      const { error: membershipError } = await supabase
        .from("group_thread_member")
        .insert(membershipPayload);

      if (membershipError) {
        throw membershipError;
      }

      const hydratedGroup: GroupChat = {
        id: groupRow.id as UUID,
        name: groupRow.name ?? trimmedName,
        createdBy: groupRow.created_by ?? currentUserId,
        memberIds,
      };

      setGroups((prev) => {
        const existing = prev.filter((group) => group.id !== hydratedGroup.id);
        return [hydratedGroup, ...existing];
      });
      setActiveGroup(hydratedGroup);
      setActivePeer(null);
      setGroupDraftName("");
      setGroupDraftMembers({});
      setIsGroupBuilderOpen(false);
    } catch (err) {
      console.error("Error creating group chat:", err);
      setGroupBuilderError("Unable to create this group. Please try again.");
    } finally {
      setIsCreatingGroup(false);
    }
  }

  function closeScheduleModal() {
    setScheduleModalState(null);
    setScheduleEditorDays([]);
    setScheduleEditorError(null);
    setScheduleEditorSuccess(null);
    setIsScheduleEditorLoading(false);
    setIsScheduleEditorSaving(false);
    setScheduleEditorReloadKey(0);
  }

  function updateScheduleEditorDay(
    dayIndex: number,
    changes: Partial<ScheduleEditorDay>,
  ) {
    setScheduleEditorDays((prev) =>
      prev.map((day) => (day.dayIndex === dayIndex ? { ...day, ...changes } : day)),
    );
  }

  function toggleScheduleEditorDay(dayIndex: number) {
    setScheduleEditorDays((prev) =>
      prev.map((day) => {
        if (day.dayIndex !== dayIndex) return day;
        if (day.works) {
          return { ...day, works: false };
        }
        return {
          ...day,
          works: true,
          startTime: day.startTime || DEFAULT_SHIFT_START,
          endTime: day.endTime || DEFAULT_SHIFT_END,
        };
      }),
    );
  }

  async function handleScheduleEditorSave() {
    if (!scheduleModalState) return;
    if (!scheduleEditorDays.length) return;
    if (!currentUserId) {
      setScheduleEditorError("You must be signed in to update schedules.");
      return;
    }

    setScheduleEditorError(null);
    setScheduleEditorSuccess(null);
    setIsScheduleEditorSaving(true);

    try {
      for (const day of scheduleEditorDays) {
        if (day.works) {
          if (!day.startTime || !day.endTime) {
            throw new Error(`Please provide start and end times for ${day.label}.`);
          }
          if (timeToMinutes(day.startTime) >= timeToMinutes(day.endTime)) {
            throw new Error(`On ${day.label}, the start time must be before the end time.`);
          }
          if (!day.businessId || !day.roleId || !day.locationId) {
            throw new Error(
              `Missing role or location details for ${scheduleModalState.employeeName}. Assign them a home role and location before scheduling here.`,
            );
          }

          const startISO = new Date(`${day.dateISO}T${day.startTime}:00`).toISOString();
          const endISO = new Date(`${day.dateISO}T${day.endTime}:00`).toISOString();

          if (day.shiftId) {
            const { error: updateErr } = await supabase
              .from("shift")
              .update({ start_ts: startISO, end_ts: endISO })
              .eq("id", day.shiftId);
            if (updateErr) throw updateErr;
          } else {
            const { data: insertedShift, error: insertErr } = await supabase
              .from("shift")
              .insert({
                business_id: day.businessId,
                location_id: day.locationId,
                role_id: day.roleId,
                start_ts: startISO,
                end_ts: endISO,
                status: "published",
                created_by: currentUserId,
              })
              .select("id")
              .single();

            if (insertErr) throw insertErr;
            if (!insertedShift) {
              throw new Error("Shift insert succeeded without returning an id.");
            }

            const { error: assignErr } = await supabase
              .from("shift_assignment")
              .insert({
                shift_id: insertedShift.id,
                user_id: scheduleModalState.employeeId,
                assigned_by: currentUserId,
                assigned_at: new Date().toISOString(),
                status: "assigned",
                source: "manager",
              });

            if (assignErr) throw assignErr;
          }
        } else if (day.shiftId) {
          const { error: deleteAssignErr } = await supabase
            .from("shift_assignment")
            .delete()
            .eq("shift_id", day.shiftId)
            .eq("user_id", scheduleModalState.employeeId);

          if (deleteAssignErr) throw deleteAssignErr;

          const { error: deleteShiftErr } = await supabase
            .from("shift")
            .delete()
            .eq("id", day.shiftId);

          if (deleteShiftErr) throw deleteShiftErr;
        }
      }

      setScheduleEditorSuccess("Schedule updated for this teammate.");
      setScheduleEditorReloadKey((val) => val + 1);
    } catch (err) {
      console.error("Error saving per-user schedule:", err);
      setScheduleEditorError(
        err instanceof Error
          ? err.message
          : "Unable to save your changes. Please try again.",
      );
    } finally {
      setIsScheduleEditorSaving(false);
    }
  }

  const headerTitle = useMemo(() => {
    if (activeGroup) return activeGroup.name;
    if (activePeer) return activePeerResolvedName || activePeer.email || "Conversation";
    return "Messages";
  }, [activeGroup, activePeer, activePeerResolvedName]);

  const headerSubtitle = useMemo(() => {
    if (activeGroup) {
      const count = activeGroup.memberIds.length;
      return `Group chat · ${count} member${count === 1 ? "" : "s"}`;
    }
    if (activePeer) {
      return `Direct message · ${activePeer.email ?? "—"}`;
    }
    return "Select a coworker or group to get started.";
  }, [activeGroup, activePeer]);

  const peerDisplayName = useMemo(() => {
    if (!activePeer) return "there";
    return activePeerResolvedName || activePeer.email || "there";
  }, [activePeer, activePeerResolvedName]);

  const peerFirstName = useMemo(() => {
    if (!peerDisplayName) return "there";
    return peerDisplayName.split(" ")[0] || peerDisplayName;
  }, [peerDisplayName]);

  const ForwardRequestCard = ({
    payload,
    statusOverride,
    onApprove,
    onDeny,
  }: {
    payload: ForwardCardPayload;
    statusOverride?: string;
    onApprove: () => void;
    onDeny: () => void;
  }) => {
    const resolvedStatus = statusOverride ?? payload.status ?? "pending";
    const statusLabel = formatStatusLabel(resolvedStatus);
    const typeLabel = formatForwardType(payload.requestType);
    const isPending = resolvedStatus === "pending";
    return (
      <div className="space-y-2 rounded-lg border border-border/60 bg-card px-3 py-3 text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Forwarded request</p>
            <p className="text-[11px] text-muted-foreground">{typeLabel}</p>
          </div>
          <Share2 className="h-4 w-4 text-primary" />
        </div>
        <dl className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Dates</dt>
            <dd className="text-right font-semibold">
              {payload.rangeLabel}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right text-foreground">{statusLabel}</dd>
          </div>
          {payload.reason ? (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="whitespace-pre-line text-foreground">
                {payload.reason}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <button
            type="button"
            onClick={onApprove}
            disabled={!isPending}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-emerald-500/40 px-3 py-1 font-semibold text-emerald-600 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
          <button
            type="button"
            onClick={onDeny}
            disabled={!isPending}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-rose-500/40 px-3 py-1 font-semibold text-rose-600 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" /> Deny
          </button>
        </div>
      </div>
    );
  };

  const ScheduleCardBlock = ({
    payload,
    onModify,
  }: {
    payload: ScheduleCardPayload;
    onModify?: () => void;
  }) => {
    return (
      <div className="space-y-2 rounded-lg border border-border/60 bg-card px-3 py-3 text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Weekly schedule snapshot</p>
            <p className="text-[11px] text-muted-foreground">
              {payload.weekLabel}
            </p>
          </div>
          <CalendarDays className="h-4 w-4 text-primary" />
        </div>
        <div className="rounded-md border border-border/40 bg-background px-3 py-2">
          {payload.slots?.length ? (
            <ul className="space-y-1">
              {payload.slots.map((slot, idx) => (
                <li
                  key={`${slot.day}-${idx}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="font-semibold">{slot.day}</span>
                  <span className="text-right text-muted-foreground">
                    {slot.time} · {slot.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No assigned shifts listed.
            </p>
          )}
        </div>
        {onModify && (
          <button
            type="button"
            onClick={onModify}
            className="inline-flex w-full items-center justify-center rounded-full border border-primary/40 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
          >
            Modify schedule
          </button>
        )}
      </div>
    );
  };

  if (loadingUser) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-lg font-semibold">Sign in to view messages</p>
          <p className="text-sm text-muted-foreground">
            You must be logged in to use Schedule-It messaging.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)] min-h-[600px] w-full bg-background gap-4 lg:gap-12">
      {/* Left sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Messages</h1>
            <p className="text-xs text-muted-foreground">
              Chat with your coworkers
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3">
            <div className="relative mb-2 px-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Direct messages
                </span>
                <div className="flex items-center gap-1">
                  {isLoadingContacts && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    ref={addContactAnchorRef}
                    onClick={() => setIsAddContactOpen((prev) => !prev)}
                    className="rounded-full border border-border/70 p-1 text-muted-foreground transition hover:bg-muted"
                    aria-label="Add coworker"
                    aria-expanded={isAddContactOpen}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {isAddContactOpen ? (
                <div
                  ref={addContactPanelRef}
                  className="absolute right-0 top-6 z-30 w-64 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xl"
                >
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Add coworker
                  </p>
                  <input
                    type="search"
                    value={addContactSearch}
                    onChange={(event) => setAddContactSearch(event.target.value)}
                    placeholder="Search people…"
                    className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto">
                    {addContactResults.length ? (
                      <ul className="space-y-1">
                        {addContactResults.map((profile) => (
                          <li key={profile.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectContact(profile)}
                              className="w-full rounded-md px-2 py-1 text-left text-xs transition hover:bg-muted"
                            >
                              <span className="block font-semibold">
                                {profileDisplayName(profile, profile.email ?? "Unnamed coworker") || "Unnamed coworker"}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {profile.email || "No email on file"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Everyone on your roster is already listed.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {conversations.length === 0 && !isLoadingContacts && (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                No coworkers found yet. Once you&apos;re added to a business,
                they&apos;ll show up here.
              </p>
            )}

            <ul className="space-y-1 pb-3">
              {conversations.map((conv) => {
                const isActive = !activeGroup && activePeer?.id === conv.peer.id;
                const incomingCount = incomingCounts[conv.peer.id] ?? 0;
                const peerProfile = conv.peer ?? null;

                return (
                  <li key={conv.peer.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectContact(conv.peer)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary-foreground/90"
                          : "hover:bg-muted",
                      ].join(" ")}
                    >
                      <AvatarCircle profile={peerProfile ?? null} sizeClass="h-8 w-8 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {profileDisplayName(conv.peer, conv.peer.email ?? "") || conv.peer.email || ""}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {conv.lastMessage?.content || "Start a conversation"}
                        </p>
                      </div>
                      {incomingCount > 0 && (
                        <span className="ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full border border-rose-300 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-400/60 dark:text-rose-200">
                          {incomingCount > 9 ? "9+" : incomingCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t px-3 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Groups
                </span>
              </div>
              <button
                type="button"
                onClick={toggleGroupBuilder}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {isGroupBuilderOpen ? "Cancel" : "New"}
              </button>
            </div>
            {isGroupBuilderOpen ? (
              <div className="mb-3 rounded-lg border border-border/70 bg-card/60 p-3 text-xs">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Group name
                  <input
                    type="text"
                    value={groupDraftName}
                    onChange={(event) => setGroupDraftName(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                    placeholder="Front desk crew"
                    disabled={isCreatingGroup}
                  />
                </label>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  You are automatically included—pick at least two teammates. · {groupDraftSelectionCount} selected
                </p>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-md border border-dashed border-border/70 p-2">
                  {contacts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Add coworkers to your business to build a group chat.
                    </p>
                  ) : (
                    contacts.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex items-center gap-2 text-[11px] text-foreground"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                          checked={Boolean(groupDraftMembers[profile.id])}
                          onChange={() => toggleGroupDraftMember(profile.id)}
                          disabled={isCreatingGroup}
                        />
                        <span className="truncate">
                          {profileDisplayName(profile, profile.email ?? "Unnamed coworker") || "Unnamed coworker"}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {groupBuilderError ? (
                  <p className="mt-2 text-[11px] text-rose-600">{groupBuilderError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={!contacts.length || isCreatingGroup}
                  className="mt-3 w-full rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {isCreatingGroup ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Creating…
                    </span>
                  ) : (
                    "Create group chat"
                  )}
                </button>
              </div>
            ) : null}
            {isLoadingGroups ? (
              <p className="px-1 text-[11px] text-muted-foreground">Loading groups…</p>
            ) : groups.length === 0 ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                Create shared spaces for teams or shifts. Select a group anytime to keep chatting together.
              </p>
            ) : (
              <ul className="space-y-2 px-1 text-xs">
                {groups.map((group) => {
                  const memberNames = group.memberIds
                    .map((id) => {
                      const profile = profileById.get(id);
                      if (!profile) return "Coworker";
                      if (profile.id === currentUserId) return "You";
                      return profileDisplayName(profile, profile.email ?? "Coworker") || "Coworker";
                    })
                    .filter(Boolean) as string[];
                  const previewNames = memberNames.slice(0, 3).join(", ");
                  const remaining = Math.max(0, memberNames.length - 3);
                  const isActive = activeGroup?.id === group.id;
                  const unreadCount = groupIncomingCounts[group.id] ?? 0;
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectGroup(group)}
                        className={[
                          "w-full rounded-lg border px-2 py-2 text-left shadow-sm transition",
                          isActive
                            ? "border-primary bg-primary/10"
                            : "border-border/60 bg-card/70 hover:border-border",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{group.name}</p>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {group.memberIds.length} members
                            </span>
                            {unreadCount > 0 && (
                              <span className="inline-flex min-w-[1.5rem] justify-center rounded-full border border-rose-300 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-400/60 dark:text-rose-200">
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {previewNames || "Members pending"}
                          {remaining ? ` +${remaining} more` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* Main chat panel */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{headerTitle}</h2>
            {headerSubtitle ? (
              <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Online</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-muted/40 px-4 py-3">
          {!activePeer && !activeGroup && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground" />
              <p>Select a coworker or group on the left to start chatting.</p>
            </div>
          )}

          {(activePeer || activeGroup) && (
            <div className="flex h-full flex-col gap-2">
              {!initialMessagesLoaded && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading messages…</span>
                </div>
              )}

              {initialMessagesLoaded && displayedMessages.length === 0 && (
                <div className="mt-4 text-xs text-muted-foreground">
                  {activeGroup
                    ? "No messages yet. Kick things off for everyone."
                    : "No messages yet. Say hi to start the conversation."}
                </div>
              )}

              {displayedMessages.map((msg) => {
                const isMine = msg.sender_id === currentUserId;
                const isGroupMessage = msg.kind === "group";
                const senderProfile = profileById.get(msg.sender_id);
                const senderLabel = !isMine && isGroupMessage
                  ? profileDisplayName(senderProfile, senderProfile?.email ?? "Coworker") || "Coworker"
                  : null;
                const scheduleCard = parseScheduleCard(msg.content);
                const forwardCard = parseForwardCard(msg.content);
                const cardStatusOverride = forwardCard
                  ? requestStatusOverrides[forwardCard.requestId] ??
                    requestStatusMap[forwardCard.requestId]
                  : undefined;
                const bubbleToneClass = scheduleCard || forwardCard
                  ? "bg-card text-foreground border border-border/60"
                  : isMine
                    ? "bg-primary text-primary-foreground"
                    : "bg-card";
                return (
                  <div
                    key={`${msg.kind}-${msg.id}`}
                    className={[
                      "flex w-full items-end gap-2",
                      isMine ? "justify-end" : "justify-start",
                    ].join(" ")}
                  >
                    {!isMine && (
                      <AvatarCircle profile={senderProfile ?? null} sizeClass="h-8 w-8 shrink-0" />
                    )}
                    <div
                      className={[
                        "max-w-[92%] rounded-2xl px-3 py-2 text-xs shadow-sm",
                        isMine ? "rounded-br-sm" : "rounded-bl-sm",
                        bubbleToneClass,
                      ].join(" ")}
                    >
                      {senderLabel ? (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {senderLabel}
                        </p>
                      ) : null}
                      {scheduleCard ? (
                        <ScheduleCardBlock
                          payload={scheduleCard}
                          onModify={() => handleScheduleModifyClick(scheduleCard)}
                        />
                      ) : forwardCard ? (
                        <ForwardRequestCard
                          payload={forwardCard}
                          statusOverride={cardStatusOverride}
                          onApprove={() => openForwardAction(forwardCard, "approve")}
                          onDeny={() => openForwardAction(forwardCard, "deny")}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground/80">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    {isMine && (
                      <AvatarCircle profile={senderProfile ?? null} sizeClass="h-8 w-8 shrink-0" />
                    )}
                  </div>
                );
              })}

              {isPeerTyping && activePeer && (
                <div className="flex w-full justify-start">
                  <div className="max-w-[65%] rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-xs shadow-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
                    </span>
                  </div>
                </div>
              )}

              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        <footer className="border-t bg-background/80 px-4 py-3">
          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white dark:bg-slate-800 px-3 py-3 shadow-sm"
          >
            <textarea
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-white dark:bg-slate-900 text-sm outline-none placeholder:text-xs placeholder:text-muted-foreground border border-gray-200 dark:border-slate-700 rounded-md px-3 py-2"
              placeholder={
                activePeer
                  ? `Message ${activePeerResolvedName || activePeer.email || "this teammate"}…`
                  : activeGroup
                    ? `Message ${activeGroup.name}…`
                    : "Select a coworker or group to start messaging…"
              }
              value={newMessage}
              onChange={handleTextareaChange}
              disabled={!(activePeer || activeGroup) || sending}
            />
            <button
              type="submit"
              disabled={!(activePeer || activeGroup) || sending || !newMessage.trim()}
              className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs disabled:opacity-50"
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </footer>
      </main>

      {/* Right column */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-l bg-card/40 px-4 py-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground">
              Conversation
            </h3>
            {activeGroup ? (
              <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-background p-3 text-xs">
                <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                  <span>{activeGroup.name}</span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {activeGroup.memberIds.length} members
                  </span>
                </div>
                <ul className="space-y-2">
                  {activeGroup.memberIds.map((memberId) => {
                    const profile = profileById.get(memberId);
                    const label = profileDisplayName(profile, profile?.email ?? "Coworker") || "Coworker";
                    const isYou = memberId === currentUserId;
                    return (
                      <li
                        key={memberId}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-3 py-1.5"
                      >
                        <span className="truncate text-foreground">{label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {isYou ? "You" : "Member"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : activePeer ? (
              <>
                <div className="mt-2 flex items-center gap-3">
                  <AvatarCircle
                    profile={activePeer}
                    sizeClass="h-12 w-12 shrink-0"
                    className="text-sm font-semibold"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {activePeerResolvedName ?? "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activePeer.email ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {activePeerRoleNames.length
                        ? `Roles: ${activePeerRoleNames.join(", ")}`
                        : "Roles not set"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activePeerLocationName ? `Location: ${activePeerLocationName}` : "Location not set"}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground whitespace-pre-line">
                  {activePeerBio ?? "Short bio or notes about this coworker can go here."}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Select a coworker or group to view details.
              </p>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground">
              Search & Filters
            </h4>
            <div className="mt-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full text-sm px-3 py-2 rounded-md border border-gray-200 bg-white dark:bg-slate-900"
              />
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setDateFilter("all")}
                  className={`px-2 py-1 rounded ${
                    dateFilter === "all"
                      ? "bg-primary/10 text-primary-foreground"
                      : "bg-transparent text-muted-foreground"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter("today")}
                  className={`px-2 py-1 rounded ${
                    dateFilter === "today"
                      ? "bg-primary/10 text-primary-foreground"
                      : "bg-transparent text-muted-foreground"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilter("7days")}
                  className={`px-2 py-1 rounded ${
                    dateFilter === "7days"
                      ? "bg-primary/10 text-primary-foreground"
                      : "bg-transparent text-muted-foreground"
                  }`}
                >
                  7 days
                </button>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground">
              {activePeer
                ? `${activePeerResolvedName ?? activePeer.email ?? "Teammate"} · schedule`
                : "Teammate schedule"}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {activePeer
                ? "Upcoming shifts for this teammate."
                : "Select a coworker to preview their week."}
            </p>
            <div className="mt-3">
              {isPeerScheduleLoading ? (
                <div className="text-xs text-muted-foreground">Loading schedule…</div>
              ) : peerScheduleError ? (
                <div className="text-xs text-rose-600">{peerScheduleError}</div>
              ) : (
                <ul className="space-y-2">
                  {activePeer ? (
                    activePeerSchedule.length === 0 ? (
                      <li className="text-xs text-muted-foreground">
                        No shifts scheduled this week.
                      </li>
                    ) : (
                      activePeerSchedule.map((slot, index) => (
                        <li
                          key={`${slot.day}-${slot.time}-${index}`}
                          className="flex items-center justify-between"
                        >
                          <div className="text-sm font-medium">{slot.day}</div>
                          <div className="text-sm text-muted-foreground">
                            {slot.time} · {slot.title}
                          </div>
                        </li>
                      ))
                    )
                  ) : (
                    <li className="text-xs text-muted-foreground">
                      Pick a coworker to see their schedule.
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </aside>
      </div>
      {scheduleModalState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="relative flex h-[82vh] w-full max-w-5xl flex-col rounded-2xl bg-card p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Quick edit · {scheduleModalState.employeeName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Adjust this teammate&apos;s shifts for {scheduleModalState.payload.weekLabel}. Changes here only affect them.
                </p>
              </div>
              <button
                type="button"
                onClick={closeScheduleModal}
                aria-label="Close schedule modal"
                className="rounded-full border border-border/70 p-2 text-muted-foreground transition hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-4 overflow-hidden md:flex-row">
              <div className="max-h-full w-full overflow-y-auto rounded-xl border border-border/70 bg-background p-4 md:w-[300px]">
                <ScheduleCardBlock
                  payload={scheduleEditorPreviewPayload ?? scheduleModalState.payload}
                />
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Need to copy templates or manage multiple employees? Use the full builder under Schedule Management.
                </p>
              </div>
              <div className="flex-1 overflow-hidden rounded-xl border border-border/70 bg-white/80 p-4 dark:bg-slate-950">
                {isScheduleEditorLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading this schedule…
                  </div>
                ) : scheduleEditorDays.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No shifts were found for this teammate during this week. Add them from the full schedule builder if needed.
                  </div>
                ) : (
                  <ul className="max-h-full space-y-3 overflow-y-auto pr-1">
                    {scheduleEditorDays.map((day) => (
                      <li
                        key={day.dateISO}
                        className="rounded-lg border border-border/70 bg-card/70 p-3 text-sm shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{day.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {day.works
                                ? `${formatTimeLabel(day.startTime)} – ${formatTimeLabel(day.endTime)}`
                                : "Marked as off"}
                            </p>
                          </div>
                          <label className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              checked={day.works}
                              onChange={() => toggleScheduleEditorDay(day.dayIndex)}
                            />
                            Working
                          </label>
                        </div>
                        {day.works ? (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Start time
                              <input
                                type="time"
                                value={day.startTime}
                                onChange={(event) =>
                                  updateScheduleEditorDay(day.dayIndex, {
                                    startTime: event.target.value,
                                  })
                                }
                                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                              />
                            </label>
                            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              End time
                              <input
                                type="time"
                                value={day.endTime}
                                onChange={(event) =>
                                  updateScheduleEditorDay(day.dayIndex, {
                                    endTime: event.target.value,
                                  })
                                }
                                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                              />
                            </label>
                          </div>
                        ) : null}
                        {day.works && (!day.roleId || !day.locationId || !day.businessId) ? (
                          <p className="mt-2 text-[11px] text-amber-600">
                            Assign this employee a default role and location before creating new shifts for them.
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {scheduleEditorError ? (
                <p className="flex-1 text-sm text-rose-600">{scheduleEditorError}</p>
              ) : scheduleEditorSuccess ? (
                <p className="flex-1 text-sm text-emerald-600">{scheduleEditorSuccess}</p>
              ) : (
                <p className="flex-1 text-xs text-muted-foreground">
                  Tip: this tool is perfect for one-off tweaks. Use the full builder for templates or bulk changes.
                </p>
              )}
              <button
                type="button"
                onClick={closeScheduleModal}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleScheduleEditorSave}
                disabled={
                  isScheduleEditorLoading ||
                  isScheduleEditorSaving ||
                  scheduleEditorDays.length === 0
                }
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {isScheduleEditorSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving
                  </span>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {decisionFeedback ? (
        <div
          className="fixed bottom-6 right-6 z-40 w-full max-w-sm rounded-xl border border-border/70 bg-card p-4 shadow-2xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                decisionFeedback.status === "approved"
                  ? "bg-emerald-500"
                  : "bg-rose-500"
              }`}
            />
            <div className="flex-1 space-y-1 text-sm">
              <p className="font-semibold">
                {decisionFeedback.status === "approved" ? "Approved!" : "Denied!"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatForwardType(decisionFeedback.requestType)} · {decisionFeedback.rangeLabel}
              </p>
              <p className="text-sm text-muted-foreground">
                Review the request details, then update Supabase.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDecisionFeedback(null)}
              className="rounded-full p-1 text-muted-foreground transition hover:bg-muted"
              aria-label="Dismiss decision notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {forwardActionState.card ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-card p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  forwardActionState.action === "approve" ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <div className="flex-1 space-y-1 text-sm">
                <p className="font-semibold">
                  {forwardActionState.action === "approve" ? "Approve request" : "Deny request"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatForwardType(forwardActionState.card.requestType)} · {forwardActionState.card.rangeLabel}
                </p>
                <p className="text-sm text-muted-foreground">
                  Review the request details, then update Supabase.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForwardAction}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close request modal"
                disabled={isForwardActionLoading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2 rounded-md border border-border/60 bg-card px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="font-semibold">
                  {formatForwardType(forwardActionState.card.requestType)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Dates</span>
                <span className="text-right font-semibold">
                  {forwardActionState.card.rangeLabel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current status</span>
                <span className="font-semibold">
                  {formatStatusLabel(
                    requestStatusOverrides[forwardActionState.card.requestId] ??
                      requestStatusMap[forwardActionState.card.requestId] ??
                      forwardActionState.card.status ??
                      "pending",
                  )}
                </span>
              </div>
              {forwardActionState.card.reason ? (
                <div>
                  <span className="text-muted-foreground">Reason</span>
                  <p className="mt-1 whitespace-pre-line text-foreground">
                    {forwardActionState.card.reason}
                  </p>
                </div>
              ) : null}
            </div>
            {forwardActionError ? (
              <p className="mt-3 text-sm text-rose-600">{forwardActionError}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeForwardAction}
                className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold"
                disabled={isForwardActionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForwardDecision}
                disabled={isForwardActionLoading}
                className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {isForwardActionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : forwardActionState.action === "approve" ? (
                  "Confirm approval"
                ) : (
                  "Confirm denial"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { AttachmentPreview } from "@/components/messages/AttachmentPreview";
import { ConversationSkeleton } from "@/components/messages/ConversationSkeleton";
import { useI18n } from "@/lib/i18n";
import { UploadedAttachment, uploadMessageAttachment, MAX_MESSAGE_ATTACHMENT_BYTES, formatFileSize } from "@/lib/messageAttachments";
import { ScheduleSlot, ScheduleCardPayload, parseForwardCard, ForwardCardPayload, encodeForwardCard, encodeScheduleCard, parseScheduleCard } from "@/lib/messagingCards";
import {
  BlockMap,
  MuteMap,
  blockUser as blockUserPreference,
  deleteGroupThread,
  fetchBlockMap,
  fetchMuteMap,
  leaveGroup as leaveGroupRpc,
  muteThread,
  removeGroupMember,
  unblockUser as unblockUserPreference,
  unmuteThread,
} from "@/lib/messagingPreferences";
import { UnreadScope, loadUnreadCounts, saveUnreadCounts, loadReadCounts, saveReadCounts, saveUnreadFlag } from "@/lib/unreadTracker";
import { cn } from "@/lib/utils";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { UUID } from "crypto";
import { CalendarDays, Share2, Loader2, MessageCircle, Plus, Users, X, ChevronLeft, Trash2, Paperclip, Send, BellRing, Cog } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";

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
  delivered_at: string | null;
  read_at: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_path?: string | null;
};

type DMConversation = {
  peer: Profile;
  lastMessage: MessageRow | null;
  roleName?: string | null;
  locationName?: string | null;
};

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
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_path?: string | null;
};

type ConversationMessage =
  | (MessageRow & { kind: "dm"; localOnly?: boolean; blockedNotice?: boolean })
  | (GroupMessageRow & { kind: "group"; localOnly?: boolean });

type MobileMessagingView = "list" | "chat";

type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type EmploymentMeta = {
  user_id: UUID;
  role_id: UUID | null;
  location_id: UUID | null;
  is_manager: boolean | null;
  is_admin: boolean | null;
};

const EMPLOYEE_SCOPE: UnreadScope = "employee";
const GROUP_NAME_MAX = 100;

const PROFILE_SELECT_WITH_TITLE =
  "id, display_name, full_name, email, photo_url, profile_title";
const PROFILE_SELECT_FALLBACK = "id, display_name, full_name, email, photo_url";

function isMissingProfileColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as PostgrestError).code;
  return code === "42703";
}

function isMissingReceiptColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const typed = error as PostgrestError;
  if (typed.code === "42703") return true;
  const message = (typed.message ?? "").toLowerCase();
  const details =
    typeof typed.details === "string" ? typed.details.toLowerCase() : "";
  return (
    message.includes("delivered_at") ||
    message.includes("read_at") ||
    details.includes("delivered_at") ||
    details.includes("read_at")
  );
}

type TimeOffRequestSummary = {
  id: UUID;
  start_ts: string;
  end_ts: string;
  status: "pending" | "approved" | "denied" | "canceled";
  reason: string | null;
};

type AvailabilityRequestSummary = {
  id: UUID;
  effective_from: string;
  effective_to: string | null;
  status: string | null;
  weekly_pattern_json: Record<string, unknown> | null;
};

type ReminderRequestType = "timeOff" | "availability" | "schedule";

type ReminderLogRow = {
  sender_id: UUID;
  recipient_id: UUID;
  request_type: ReminderRequestType;
  request_identifier: string;
  send_count: number;
  last_sent_at: string;
};

type ReminderQuota = {
  count: number;
  remaining: number;
  limit: number;
  reached: boolean;
};

const REMINDER_LIMIT_PER_REQUEST = 3;
const REMINDER_LOG_TABLE = "message_reminder_log";
const SCHEDULE_FORWARD_LINK = "/employermanagement/createschedule";
function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy;
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  const copy = new Date(start);
  copy.setDate(copy.getDate() + 7);
  return copy;
}

function formatDropRange(startIso: string, endIso: string, locale: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const start = new Date(startIso).toLocaleTimeString(locale, opts);
  const end = new Date(endIso).toLocaleTimeString(locale, opts);
  return `${start} – ${end}`;
}

function formatTimeOffRange(
  startIso: string,
  endIso: string,
  locale: string,
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const start = formatter.format(new Date(startIso));
  // end is exclusive in DB, so subtract one day
  const endDate = new Date(new Date(endIso).getTime() - 1);
  const end = formatter.format(endDate);
  return start === end ? start : `${start} – ${end}`;
}

function formatAvailabilityRange(
  startIso: string,
  endIso: string | null,
  locale: string,
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const start = formatter.format(new Date(startIso));
  if (!endIso) {
    return `${start} →`;
  }
  const end = formatter.format(new Date(endIso));
  return `${start} – ${end}`;
}

function extractAvailabilityReason(
  payload: Record<string, unknown> | null,
): string | null {
  if (!payload) return null;
  const { reason, pattern } = payload;
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  if (pattern && typeof pattern === "object" && pattern !== null) {
    const nestedReason = (pattern as Record<string, unknown>).reason;
    if (typeof nestedReason === "string" && nestedReason.trim()) {
      return nestedReason.trim();
    }
  }
  return null;
}

function buildReminderKey(
  type: ReminderRequestType,
  identifier: string,
  recipientId: UUID,
) {
  return `${type}:${identifier}:${recipientId}`;
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
    .map(part => (part[0] ?? "").toUpperCase())
    .join("");
  return chars || "?";
}

function profileSortValue(profile: Profile) {
  const resolved = profileDisplayName(profile, profile.email ?? "") || profile.email || "";
  return resolved.trim().toLowerCase();
}

function compareProfilesByName(a: Profile, b: Profile) {
  const nameA = profileSortValue(a);
  const nameB = profileSortValue(b);
  if (nameA && nameB && nameA !== nameB) {
    return nameA.localeCompare(nameB);
  }
  if (nameA && !nameB) return -1;
  if (!nameA && nameB) return 1;
  return (a.email ?? "").localeCompare(b.email ?? "");
}

function sortProfilesByName(profiles: Profile[]) {
  return [...profiles].sort(compareProfilesByName);
}

function sortConversationsByName(conversations: DMConversation[]) {
  return [...conversations].sort((a, b) => compareProfilesByName(a.peer, b.peer));
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

function isMissingRelationError(err: unknown, table: string) {
  if (!err || typeof err !== "object") {
    return false;
  }
  const code = (err as { code?: string }).code;
  if (code === "42P01") {
    return true;
  }
  const message =
    ((err as { message?: string }).message ?? "").toLowerCase();
  return message.includes(`relation \"${table}\"`) ||
    message.includes(`relation '${table}'`);
}

export default function EmployeeMessagingPage() {
  const supabase = createClientComponentClient();
  const { t, locale } = useI18n();
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<UUID | null>(null);
  const [businessId, setBusinessId] = useState<UUID | null>(null);
  const [currentEmploymentFlags, setCurrentEmploymentFlags] = useState<
    { is_manager: boolean | null; is_admin: boolean | null } | null
  >(null);
  const [roleLookup, setRoleLookup] = useState<Record<string, string>>({});
  const [locationLookup, setLocationLookup] = useState<Record<string, string>>({});
  const [employmentMetaByUserId, setEmploymentMetaByUserId] = useState<
    Record<
      string,
      {
        role_id: UUID | null;
        location_id: UUID | null;
        is_manager: boolean | null;
        is_admin: boolean | null;
      }
    >
  >({});
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [selfProfile, setSelfProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activePeer, setActivePeer] = useState<Profile | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentDraft | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
    useEffect(() => {
      return () => {
        if (pendingAttachment?.previewUrl) {
          URL.revokeObjectURL(pendingAttachment.previewUrl);
        }
      };
    }, [pendingAttachment]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days">(
    "all",
  );
  const [weekSchedule, setWeekSchedule] = useState<ScheduleSlot[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [timeOffRequests, setTimeOffRequests] = useState<
    TimeOffRequestSummary[]
  >([]);
  const [availabilityRequests, setAvailabilityRequests] = useState<
    AvailabilityRequestSummary[]
  >([]);
  const [isLoadingRequestData, setIsLoadingRequestData] = useState(false);
  const [reminderUsage, setReminderUsage] = useState<
    Record<string, ReminderLogRow>
  >({});
  const [reminderTrackingEnabled, setReminderTrackingEnabled] = useState(true);
  const [forwardStatusMap, setForwardStatusMap] = useState<Record<string, string>>({});
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [scheduleModalState, setScheduleModalState] = useState<
    { payload: ScheduleCardPayload; employeeName: string } | null
  >(null);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [addContactSearch, setAddContactSearch] = useState("");
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const profileById = useMemo(() => {
    const map = new Map<UUID, Profile>();
    contacts.forEach((profile) => {
      if (profile?.id) {
        map.set(profile.id, profile);
      }
    });
    if (selfProfile?.id) {
      map.set(selfProfile.id, selfProfile);
    }
    return map;
  }, [contacts, selfProfile]);
  const [isGroupBuilderOpen, setIsGroupBuilderOpen] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState("");
  const [groupDraftMembers, setGroupDraftMembers] = useState<Record<UUID, boolean>>({});
  const groupDraftSelectionCount = useMemo(
    () =>
      Object.values(groupDraftMembers).reduce(
        (count, selected) => (selected ? count + 1 : count),
        0,
      ),
    [groupDraftMembers],
  );
  const [groupBuilderError, setGroupBuilderError] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState<Record<string, boolean>>({});
  const [blockedMe, setBlockedMe] = useState<Record<string, boolean>>({});
  const [mutedPeers, setMutedPeers] = useState<Record<string, boolean>>({});
  const [mutedGroups, setMutedGroups] = useState<Record<string, boolean>>({});
  const [preferenceBusyKey, setPreferenceBusyKey] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceMenuOpen, setPreferenceMenuOpen] = useState<"peer" | "group" | null>(null);
  const peerPreferenceMenuRef = useRef<HTMLDivElement | null>(null);
  const groupPreferenceMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileView, setMobileView] = useState<MobileMessagingView>("list");
  const [infoPanelMode, setInfoPanelMode] = useState<"peer" | "group" | null>(null);
  const [incomingCounts, setIncomingCountsState] = useState<Record<string, number>>(() =>
    loadUnreadCounts(EMPLOYEE_SCOPE, "dm"),
  );
  const [groupIncomingCounts, setGroupIncomingCountsState] = useState<Record<string, number>>(() =>
    loadUnreadCounts(EMPLOYEE_SCOPE, "group"),
  );

  const setIncomingCounts = useCallback(
    (value: React.SetStateAction<Record<string, number>>) => {
      setIncomingCountsState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        saveUnreadCounts(EMPLOYEE_SCOPE, "dm", next);
        return next;
      });
    },
    [setIncomingCountsState],
  );

  const setGroupIncomingCounts = useCallback(
    (value: React.SetStateAction<Record<string, number>>) => {
      setGroupIncomingCountsState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        saveUnreadCounts(EMPLOYEE_SCOPE, "group", next);
        return next;
      });
    },
    [setGroupIncomingCountsState],
  );
  const dmTotalsRef = useRef<Record<string, number>>({});
  const groupTotalsRef = useRef<Record<string, number>>({});
  const dmReadCountsRef = useRef<Record<string, number>>({});
  const groupReadCountsRef = useRef<Record<string, number>>({});
  const [readCountsReady, setReadCountsReady] = useState(false);
  const applyMessagingPreferences = useCallback(
    (blockMap: BlockMap, muteMap: MuteMap) => {
      setBlockedByMe(blockMap.blockedByMe);
      setBlockedMe(blockMap.blockedMe);
      setMutedPeers(muteMap.dm);
      setMutedGroups(muteMap.group);
    },
    [],
  );

  const fetchMessagingPreferences = useCallback(async () => {
    if (!currentUserId) {
      return {
        blockMap: { blockedByMe: {}, blockedMe: {} },
        muteMap: { dm: {}, group: {} },
      } as { blockMap: BlockMap; muteMap: MuteMap };
    }

    const [blockMap, muteMap] = await Promise.all([
      fetchBlockMap(supabase, currentUserId),
      fetchMuteMap(supabase, currentUserId),
    ]);

    return { blockMap, muteMap };
  }, [currentUserId, supabase]);

  const refreshMessagingPreferences = useCallback(async () => {
    const { blockMap, muteMap } = await fetchMessagingPreferences();
    applyMessagingPreferences(blockMap, muteMap);
  }, [applyMessagingPreferences, fetchMessagingPreferences]);

  useEffect(() => {
    setPreferenceMenuOpen(null);
  }, [activePeer?.id, activeGroup?.id]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        (peerPreferenceMenuRef.current &&
          peerPreferenceMenuRef.current.contains(target)) ||
        (groupPreferenceMenuRef.current &&
          groupPreferenceMenuRef.current.contains(target))
      ) {
        return;
      }
      setPreferenceMenuOpen(null);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => {
        document.removeEventListener("mousedown", handleOutsideClick);
      };
    }
    return undefined;
  }, []);

  const totalUnreadCount = useMemo(() => {
    const directTotal = Object.entries(incomingCounts).reduce(
      (sum, [peerId, count]) => {
        if (mutedPeers[peerId]) return sum;
        return sum + Math.max(0, count);
      },
      0,
    );
    const groupTotal = Object.entries(groupIncomingCounts).reduce(
      (sum, [groupId, count]) => {
        if (mutedGroups[groupId]) return sum;
        return sum + Math.max(0, count);
      },
      0,
    );
    return directTotal + groupTotal;
  }, [incomingCounts, groupIncomingCounts, mutedGroups, mutedPeers]);

  const hasUnreadMessages = totalUnreadCount > 0;
  const unreadBadgeLabel = totalUnreadCount > 99 ? "99+" : totalUnreadCount;

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      const { blockMap, muteMap } = await fetchMessagingPreferences();
      if (cancelled) return;
      applyMessagingPreferences(blockMap, muteMap);
    }

    loadPreferences().catch((err) => {
      console.error("Failed to load messaging preferences", err);
    });

    return () => {
      cancelled = true;
    };
  }, [applyMessagingPreferences, fetchMessagingPreferences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    dmReadCountsRef.current = loadReadCounts(EMPLOYEE_SCOPE, "dm");
    groupReadCountsRef.current = loadReadCounts(EMPLOYEE_SCOPE, "group");
    setReadCountsReady(true);
  }, []);

  useEffect(() => {
    setPreferenceError(null);
  }, [activePeer?.id, activeGroup?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
    };
    setIsMobileLayout(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }
    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout) return;
    if (!activePeer && !activeGroup) {
      setMobileView("list");
    }
  }, [activeGroup, activePeer, isMobileLayout]);

  useEffect(() => {
    if (infoPanelMode === "peer" && !activePeer) {
      setInfoPanelMode(null);
    }
    if (infoPanelMode === "group" && !activeGroup) {
      setInfoPanelMode(null);
    }
  }, [activeGroup, activePeer, infoPanelMode]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const actionMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const addContactAnchorRef = useRef<HTMLButtonElement | null>(null);
  const addContactPanelRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(
    null,
  );
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePeerRef = useRef<Profile | null>(null);
  const activeGroupRef = useRef<GroupChat | null>(null);
  const peerReceiptSyncRef = useRef<Record<string, boolean>>({});
  const receiptColumnsAvailableRef = useRef(true);

  const persistDmReads = useCallback((next: Record<string, number>) => {
    dmReadCountsRef.current = next;
    saveReadCounts(EMPLOYEE_SCOPE, "dm", next);
  }, []);

  const persistGroupReads = useCallback((next: Record<string, number>) => {
    groupReadCountsRef.current = next;
    saveReadCounts(EMPLOYEE_SCOPE, "group", next);
  }, []);

  const syncPeerReceipts = useCallback(
    async (peerId: UUID) => {
      if (!currentUserId) return;
      if (peerReceiptSyncRef.current[peerId]) return;
      peerReceiptSyncRef.current[peerId] = true;
      try {
        const { error: rpcError } = await supabase.rpc(
          "mark_direct_messages_read",
          {
            peer_id: peerId,
          },
        );

        if (rpcError) {
          console.warn(
            "mark_direct_messages_read RPC failed; falling back to legacy update.",
            rpcError,
          );
          const { error: legacyError } = await supabase
            .from("message")
            .update({ read_at: new Date().toISOString() })
            .eq("recipient_id", currentUserId)
            .eq("sender_id", peerId)
            .is("read_at", null);

          if (legacyError) {
            throw legacyError;
          }
        }
      } catch (err) {
        console.error("Error syncing read receipts:", err);
      } finally {
        delete peerReceiptSyncRef.current[peerId];
      }
    },
    [currentUserId, supabase],
  );

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
      if (latestTotal > current) {
        void syncPeerReceipts(peerId);
      }
    },
    [readCountsReady, persistDmReads, setIncomingCounts, syncPeerReceipts],
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
    [readCountsReady, persistGroupReads, setGroupIncomingCounts],
  );

  const handleMessageScroll = useCallback(() => {
    const container = messageContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom > 16) return;
    if (activePeer?.id) {
      markPeerAsRead(activePeer.id);
    }
    if (activeGroup?.id) {
      markGroupAsRead(activeGroup.id);
    }
  }, [activePeer?.id, activeGroup?.id, markPeerAsRead, markGroupAsRead]);

  // Load current user so we can scope data queries
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

  // Load active employment to determine business context
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    async function loadActiveEmployment() {
      const { data, error } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin")
        .eq("user_id", currentUserId)
        .eq("status", "active")
        .maybeSingle();

      if (cancelled) return;

      if (error || !data?.business_id) {
        console.error("Error loading active employment:", error);
        setBusinessId(null);
        setCurrentEmploymentFlags(null);
        setEmploymentMetaByUserId({});
        setContacts([]);
        setConversations([]);
        setActivePeer(null);
        setIsLoadingContacts(false);
        return;
      }
      setBusinessId(data.business_id as UUID);
      setCurrentEmploymentFlags({
        is_manager: data.is_manager ?? null,
        is_admin: data.is_admin ?? null,
      });
    }

    loadActiveEmployment();

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setSelfProfile(null);
      return;
    }

    const userId = currentUserId;

    let cancelled = false;

    async function loadSelfProfile() {
      const response = await supabase
        .from("profiles")
        .select(PROFILE_SELECT_WITH_TITLE)
        .eq("id", currentUserId)
        .maybeSingle();

      if (cancelled) return;

      let profileRow = response.data as Profile | null;
      let profileError = response.error;

      if (profileError && isMissingProfileColumn(profileError)) {
        const fallback = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_FALLBACK)
          .eq("id", currentUserId)
          .maybeSingle();

        if (cancelled) return;

        profileRow = fallback.data as Profile | null;
        profileError = fallback.error;
      }

      if (profileError) {
        console.error("Error loading self profile:", profileError);
        setSelfProfile({
          id: userId,
          display_name: null,
          full_name: null,
          email: null,
          photo_url: null,
          profile_title: null,
        });
        return;
      }

      if (profileRow) {
        setSelfProfile({
          ...profileRow,
          profile_title: profileRow.profile_title ?? null,
        });
      } else {
        setSelfProfile({
          id: userId,
          display_name: null,
          full_name: null,
          email: null,
          photo_url: null,
          profile_title: null,
        });
      }
    }

    loadSelfProfile();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  // Load role/location lookups for the active business
  useEffect(() => {
    if (!businessId) {
      setRoleLookup({});
      setLocationLookup({});
      return;
    }

    let cancelled = false;

    async function loadLookups() {
      const [roleRes, locationRes] = await Promise.all([
        supabase
          .from("role")
          .select("id,name")
          .eq("business_id", businessId)
          .order("name", { ascending: true }),
        supabase
          .from("location")
          .select("id,name")
          .eq("business_id", businessId)
          .order("name", { ascending: true }),
      ]);

      if (cancelled) return;

      if (!roleRes.error && roleRes.data) {
        const roleMap: Record<string, string> = {};
        (roleRes.data as { id: UUID; name: string | null }[]).forEach((r) => {
          roleMap[r.id] = r.name ?? "";
        });
        setRoleLookup(roleMap);
      } else {
        setRoleLookup({});
      }

      if (!locationRes.error && locationRes.data) {
        const locationMap: Record<string, string> = {};
        (locationRes.data as { id: UUID; name: string | null }[]).forEach((loc) => {
          locationMap[loc.id] = loc.name ?? "";
        });
        setLocationLookup(locationMap);
      } else {
        setLocationLookup({});
      }
    }

    loadLookups();

    return () => {
      cancelled = true;
    };
  }, [supabase, businessId]);

  // Load coworker roster for the business
  useEffect(() => {
    if (!businessId || !currentUserId) return;

    let cancelled = false;

    async function loadRoster() {
      setIsLoadingContacts(true);

      const { data, error } = await supabase
        .from("employment")
        .select("user_id, role_id, location_id, status, is_manager, is_admin")
        .eq("business_id", businessId)
        .eq("status", "active");

      if (cancelled) return;

      if (error || !data) {
        console.error("Error loading coworker roster:", error);
        setEmploymentMetaByUserId({});
        setContacts([]);
        setConversations([]);
        setActivePeer(null);
        setIsLoadingContacts(false);
        return;
      }

      const rows = data as EmploymentMeta[];
      const coworkers = rows.filter(
        (row) => row.user_id && row.user_id !== currentUserId,
      );
      const coworkerIds = coworkers.map((row) => row.user_id);

      let profiles: Profile[] = [];
      if (coworkerIds.length > 0) {
        const response = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_WITH_TITLE)
          .in("id", coworkerIds);

        if (cancelled) return;

        let profileRows = response.data as Profile[] | null;
        let profileError = response.error;

        if (profileError && isMissingProfileColumn(profileError)) {
          const fallback = await supabase
            .from("profiles")
            .select(PROFILE_SELECT_FALLBACK)
            .in("id", coworkerIds);

          if (cancelled) return;

          profileRows = fallback.data as Profile[] | null;
          profileError = fallback.error;
        }

        if (!profileError && profileRows) {
          profiles = profileRows.map((row) => ({
            ...row,
            profile_title: row.profile_title ?? null,
          }));
        } else if (profileError) {
          console.error("Error loading coworker profiles:", profileError);
        }
      }

      if (cancelled) return;

      const sortedProfiles = sortProfilesByName(profiles);
      setContacts(sortedProfiles);
      const employmentMap: Record<
        string,
        {
          role_id: UUID | null;
          location_id: UUID | null;
          is_manager: boolean | null;
          is_admin: boolean | null;
        }
      > = {};
      coworkers.forEach((row) => {
        employmentMap[row.user_id] = {
          role_id: row.role_id ?? null,
          location_id: row.location_id ?? null,
          is_manager: row.is_manager ?? null,
          is_admin: row.is_admin ?? null,
        };
      });
      setEmploymentMetaByUserId(employmentMap);

      const nextConversations = sortConversationsByName(
        sortedProfiles.map((peer) => ({ peer, lastMessage: null } as DMConversation)),
      );

      setConversations(nextConversations);
      setActivePeer((prev) => {
        if (prev && nextConversations.some((conv) => conv.peer.id === prev.id)) {
          return prev;
        }
        if (activeGroupRef.current) {
          return null;
        }
        return nextConversations.length > 0 ? nextConversations[0].peer : null;
      });
      setIsLoadingContacts(false);
    }

    loadRoster();

    return () => {
      cancelled = true;
    };
  }, [supabase, businessId, currentUserId]);

  // Load groups the employee belongs to
  useEffect(() => {
    if (!currentUserId) {
      setGroups([]);
      setActiveGroup(null);
      return;
    }

    let cancelled = false;

    async function loadGroups() {
      setIsLoadingGroups(true);
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from("group_thread_member")
          .select("group_id, user_id, group:group_thread(id, name, created_by)")
          .eq("user_id", currentUserId);

        if (membershipError) {
          throw membershipError;
        }

        const typedMembershipRows = (membershipRows ?? []).map((row) => {
          const rawGroup = Array.isArray(row.group) ? row.group[0] : row.group;
          const normalizedGroup = rawGroup
            ? {
                id: rawGroup.id as UUID,
                name: (rawGroup.name ?? null) as string | null,
                created_by: (rawGroup.created_by ?? null) as UUID | null,
              }
            : null;

          return {
            group_id: row.group_id as UUID,
            user_id: row.user_id as UUID,
            group: normalizedGroup,
          };
        });

        const groupMeta = new Map<UUID, { name: string; createdBy: UUID | null }>();
        typedMembershipRows.forEach((row) => {
          const group = row.group;
          if (group?.id) {
            groupMeta.set(group.id, {
              name: group.name ?? t("employee.messages.conversationFallback"),
              createdBy: group.created_by ?? null,
            });
          }
        });

        const groupIds = Array.from(groupMeta.keys());
        if (groupIds.length === 0) {
          if (!cancelled) {
            setGroups([]);
            setActiveGroup(null);
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
        const typedMemberRows = (memberRows ?? []) as Array<{ group_id: UUID; user_id: UUID }>;
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
            name: meta?.name ?? t("employee.messages.groupsHeading"),
            createdBy: meta?.createdBy ?? null,
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
        if (cancelled) return;

        const missingTables =
          isMissingRelationError(err, "group_thread_member") ||
          isMissingRelationError(err, "group_thread") ||
          isMissingRelationError(err, "group_message");

        if (missingTables) {
          console.warn("Group chat tables not found; skipping group load.");
        } else {
          console.error("Error loading groups:", err);
        }
        setGroups([]);
        setActiveGroup(null);
        setIsLoadingGroups(false);
      }
    }

    loadGroups();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, t]);

  // Merge lookup info onto conversations once available
  useEffect(() => {
    setConversations((prev) => {
      let changed = false;
      const next = prev.map((conv) => {
        const meta = employmentMetaByUserId[conv.peer.id];
        const roleName = meta?.role_id ? roleLookup[meta.role_id] ?? null : null;
        const locationName = meta?.location_id
          ? locationLookup[meta.location_id] ?? null
          : null;

        if (conv.roleName === roleName && conv.locationName === locationName) {
          return conv;
        }

        changed = true;
        return { ...conv, roleName, locationName };
      });

      return changed ? sortConversationsByName(next) : prev;
    });
  }, [employmentMetaByUserId, roleLookup, locationLookup]);

  // Close the unified action menu when clicking outside or when the peer changes
  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!isActionMenuOpen) return;
      const target = event.target as Node;
      const anchor = actionMenuAnchorRef.current;
      const panel = actionMenuPanelRef.current;
      if (!panel || !anchor) return;
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
    function handleAddContactClick(event: MouseEvent) {
      if (!isAddContactOpen) return;
      if (
        addContactPanelRef.current &&
        addContactAnchorRef.current &&
        !addContactPanelRef.current.contains(event.target as Node) &&
        !addContactAnchorRef.current.contains(event.target as Node)
      ) {
        setIsAddContactOpen(false);
        setAddContactSearch("");
      }
    }

    document.addEventListener("mousedown", handleAddContactClick);
    return () => {
      document.removeEventListener("mousedown", handleAddContactClick);
    };
  }, [isAddContactOpen]);

  useEffect(() => {
    if (!activePeer) {
      setIsActionMenuOpen(false);
      setScheduleModalState(null);
    }
  }, [activePeer]);

  useEffect(() => {
    setScheduleModalState(null);
  }, [activePeer?.id]);

  useEffect(() => {
    activePeerRef.current = activePeer;
  }, [activePeer]);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    handleMessageScroll();
  }, [messages.length, handleMessageScroll]);

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
        const currentActivePeerId = activePeerRef.current?.id ?? null;
        if (currentActivePeerId) {
          markPeerAsRead(currentActivePeerId);
        }
      }
    }

    loadIncomingCounts();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, conversations, readCountsReady, markPeerAsRead, setIncomingCounts]);

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
          if (activePeer?.id === senderId) {
            markPeerAsRead(senderId);
            return;
          }
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
  }, [supabase, currentUserId, activePeer?.id, markPeerAsRead, setIncomingCounts]);

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
        const currentActiveGroupId = activeGroupRef.current?.id ?? null;
        if (currentActiveGroupId) {
          markGroupAsRead(currentActiveGroupId);
        }
      }
    }

    loadGroupCounts();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, groups, readCountsReady, markGroupAsRead, setGroupIncomingCounts]);

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
          if (activeGroup?.id === groupId) {
            markGroupAsRead(groupId);
            return;
          }
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
  }, [supabase, currentUserId, groups, activeGroup?.id, markGroupAsRead, setGroupIncomingCounts]);

  useEffect(() => {
    markPeerAsRead(activePeer?.id ?? null);
  }, [activePeer?.id, markPeerAsRead]);

  useEffect(() => {
    if (!readCountsReady) return;
    if (activePeer?.id) {
      markPeerAsRead(activePeer.id);
    }
  }, [readCountsReady, activePeer?.id, markPeerAsRead]);

  useEffect(() => {
    markGroupAsRead(activeGroup?.id ?? null);
  }, [activeGroup?.id, markGroupAsRead]);

  useEffect(() => {
    if (!readCountsReady) return;
    if (activeGroup?.id) {
      markGroupAsRead(activeGroup.id);
    }
  }, [readCountsReady, activeGroup?.id, markGroupAsRead]);

  useEffect(() => {
    if (!readCountsReady) return;
    saveUnreadFlag(EMPLOYEE_SCOPE, hasUnreadMessages);
  }, [hasUnreadMessages, readCountsReady]);

  const scheduleShiftFallback = useMemo(
    () => t("employee.messages.schedule.shiftFallback"),
    [t],
  );

  // Load schedule
  useEffect(() => {
    if (!currentUserId) {
      setWeekSchedule([]);
      setIsLoadingSchedule(false);
      return;
    }

    let cancelled = false;

    async function loadSchedule() {
      setIsLoadingSchedule(true);
      try {
        const weekStart = startOfWeek(new Date());
        const weekEnd = endOfWeek(new Date());

        const { data: assignmentRows, error: assignmentError } = await supabase
          .from("shift_assignment")
          .select("id,shift_id,status")
          .eq("user_id", currentUserId)
          .in("status", ["assigned", "accepted"]); // Only show confirmed shifts in sidebar snapshot

        if (assignmentError) throw assignmentError;
        if (!assignmentRows || assignmentRows.length === 0) {
          if (cancelled) return;
          setWeekSchedule([]);
          return;
        }

        const shiftIds = Array.from(
          new Set(assignmentRows.map((row) => row.shift_id)),
        );

        if (shiftIds.length === 0) {
          if (cancelled) return;
          setWeekSchedule([]);
          return;
        }

        const { data: shiftRows, error: shiftError } = await supabase
          .from("shift")
          .select("id,role_id,location_id,start_ts,end_ts,status")
          .in("id", shiftIds)
          .neq("status", "canceled")
          .gte("start_ts", weekStart.toISOString())
          .lt("start_ts", weekEnd.toISOString());

        if (shiftError) throw shiftError;
        if (!shiftRows || shiftRows.length === 0) {
          if (cancelled) return;
          setWeekSchedule([]);
          return;
        }

        const roleIds = Array.from(
          new Set(
            shiftRows
              .map((row) => row.role_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        const locationIds = Array.from(
          new Set(
            shiftRows
              .map((row) => row.location_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        const [roleResult, locationResult] = await Promise.all([
          roleIds.length
            ? supabase.from("role").select("id,name").in("id", roleIds)
            : Promise.resolve({ data: [], error: null } as {
                data: { id: string; name: string | null }[];
                error: null;
              }),
          locationIds.length
            ? supabase.from("location").select("id,name").in("id", locationIds)
            : Promise.resolve({ data: [], error: null } as {
                data: { id: string; name: string | null }[];
                error: null;
              }),
        ]);

        if (roleResult.error) throw roleResult.error;
        if (locationResult.error) throw locationResult.error;

        const roleById: Record<string, string | null> = {};
        for (const role of roleResult.data ?? []) {
          roleById[role.id] = role.name ?? null;
        }
        const locationById: Record<string, string | null> = {};
        for (const loc of locationResult.data ?? []) {
          locationById[loc.id] = loc.name ?? null;
        }

        const sortedShifts = [...shiftRows].sort((a, b) =>
          new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime(),
        );

        const mappedSlots: ScheduleSlot[] = sortedShifts.map((shift) => {
          const start = new Date(shift.start_ts);
          const dayLabel = start.toLocaleDateString(locale, {
            weekday: "short",
          });
          const roleName = shift.role_id ? roleById[shift.role_id] : null;
          const locationName = shift.location_id
            ? locationById[shift.location_id]
            : null;
          const title =
            roleName ??
            locationName ??
            scheduleShiftFallback;
          return {
            day: dayLabel,
            time: formatDropRange(shift.start_ts, shift.end_ts, locale),
            title,
          };
        });

        if (cancelled) return;
        setWeekSchedule(mappedSlots);
      } catch (err) {
        console.error("Error loading schedule snapshot:", err);
        if (!cancelled) {
          setWeekSchedule([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSchedule(false);
        }
      }
    }

    loadSchedule();
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    currentUserId,
    locale,
    scheduleShiftFallback,
  ]);

  // Dropped shift shortcuts removed per latest UX direction.

  // Load the employee's own time-off and availability requests for reminders/forwards
  useEffect(() => {
    if (!currentUserId) {
      setTimeOffRequests([]);
      setAvailabilityRequests([]);
      return;
    }

    let cancelled = false;

    async function loadRequestData() {
      setIsLoadingRequestData(true);
      try {
        const [timeOffRes, availabilityRes] = await Promise.all([
          supabase
            .from("time_off_request")
            .select("id,start_ts,end_ts,reason,status")
            .eq("user_id", currentUserId)
            .in("status", ["pending", "approved"])
            .order("start_ts", { ascending: false })
            .limit(10),
          supabase
            .from("availability")
            .select(
              "id,effective_from,effective_to,status,weekly_pattern_json",
            )
            .eq("user_id", currentUserId)
            .in("status", ["pending", "approved"])
            .order("effective_from", { ascending: false })
            .limit(10),
        ]);

        if (cancelled) return;

        if (timeOffRes.error) {
          throw timeOffRes.error;
        }
        if (availabilityRes.error) {
          throw availabilityRes.error;
        }

        setTimeOffRequests((timeOffRes.data ?? []) as TimeOffRequestSummary[]);
        setAvailabilityRequests(
          (availabilityRes.data ?? []) as AvailabilityRequestSummary[],
        );
      } catch (err) {
        console.error("Error loading request data:", err);
        if (!cancelled) {
          setTimeOffRequests([]);
          setAvailabilityRequests([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRequestData(false);
        }
      }
    }

    loadRequestData();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  // Load reminder usage for the active peer so we can enforce limits
  useEffect(() => {
    if (!currentUserId || !activePeer || !reminderTrackingEnabled) {
      setReminderUsage({});
      return;
    }

    let cancelled = false;
    const peerId = activePeer.id;

    async function loadReminderUsage() {
      try {
        const { data, error } = await supabase
          .from(REMINDER_LOG_TABLE)
          .select(
            "sender_id,recipient_id,request_type,request_identifier,send_count,last_sent_at",
          )
          .eq("sender_id", currentUserId)
          .eq("recipient_id", peerId);

        if (error) {
          throw error;
        }

        if (cancelled) return;

        const map: Record<string, ReminderLogRow> = {};
        (data ?? []).forEach((row) => {
          const typed = row as ReminderLogRow;
          const key = buildReminderKey(
            typed.request_type,
            typed.request_identifier,
            typed.recipient_id,
          );
          map[key] = typed;
        });
        setReminderUsage(map);
      } catch (err) {
        console.error("Error loading reminder usage:", err);
        if (isMissingRelationError(err, REMINDER_LOG_TABLE)) {
          setReminderTrackingEnabled(false);
          setReminderUsage({});
        }
      }
    }

    loadReminderUsage();
    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, activePeer, reminderTrackingEnabled]);

  // Load messages for the active peer or group
  useEffect(() => {
    if (!currentUserId) return;
    if (!activePeer && !activeGroup) {
      setMessages([]);
      setInitialMessagesLoaded(false);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
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
        }
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, activePeer, activeGroup]);

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

      const mergeIncomingDmUpdate = (incoming: MessageRow) => {
        const participants = [incoming.sender_id, incoming.recipient_id];
        if (!participants.includes(currentUserId) || !participants.includes(activePeer.id)) {
          return;
        }
        setMessages((prev) => {
          let changed = false;
          const next = prev.map((message) => {
            if (message.id !== incoming.id) return message;
            changed = true;
            return { ...message, ...incoming, kind: "dm" as const };
          });
          return changed ? next : prev;
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
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "message",
          },
          (payload) => {
            const updatedRow = payload.new as MessageRow;
            mergeIncomingDmUpdate(updatedRow);
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
      setForwardStatusMap({});
      return;
    }

    const forwardCards = messages
      .map((msg) => parseForwardCard(msg.content))
      .filter((card): card is ForwardCardPayload => Boolean(card));

    if (forwardCards.length === 0) {
      setForwardStatusMap({});
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
          setForwardStatusMap(next);
        }
      } catch (err) {
        console.error("Error loading forward request statuses:", err);
      }
    }

    loadForwardStatuses();

    return () => {
      cancelled = true;
    };
  }, [messages, supabase]);

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

  const activePeerDisplayName = useMemo(() => {
    if (!activePeer) return null;
    const resolved = profileDisplayName(
      activePeer,
      t("employee.messages.conversationFallback"),
    );
    return resolved || t("employee.messages.conversationFallback");
  }, [activePeer, t]);

  const activePeerRole = useMemo(() => {
    if (!activePeer) return null;
    const meta = employmentMetaByUserId[activePeer.id];
    if (!meta?.role_id) return null;
    return roleLookup[meta.role_id] ?? null;
  }, [activePeer, employmentMetaByUserId, roleLookup]);

  const activePeerLocation = useMemo(() => {
    if (!activePeer) return null;
    const meta = employmentMetaByUserId[activePeer.id];
    if (!meta?.location_id) return null;
    return locationLookup[meta.location_id] ?? null;
  }, [activePeer, employmentMetaByUserId, locationLookup]);

  const activePeerBio = activePeer?.profile_title ?? null;

  const activePeerSummary = useMemo(() => {
    if (!activePeerDisplayName) return null;
    const explicitBio = activePeerBio?.trim();
    if (explicitBio) return explicitBio;
    const roleLabel =
      activePeerRole ?? t("employee.messages.conversation.roleFallback");
    const locationLabel =
      activePeerLocation ?? t("employee.messages.conversation.locationFallback");
    return t("employee.messages.conversation.bioResolved", {
      name: activePeerDisplayName,
      role: roleLabel,
      location: locationLabel,
    });
  }, [
    activePeerDisplayName,
    activePeerRole,
    activePeerLocation,
    activePeerBio,
    t,
  ]);

  const peerFallbackName = t("employee.messages.conversationFallback");
  const resolvedPeerName = activePeerDisplayName ?? peerFallbackName;
  const activePeerMuted = activePeer ? Boolean(mutedPeers[activePeer.id]) : false;
  const activePeerBlockedByMe = activePeer ? Boolean(blockedByMe[activePeer.id]) : false;
  const activePeerBlockedMe = activePeer ? Boolean(blockedMe[activePeer.id]) : false;
  const activePeerBlocked = activePeerBlockedByMe || activePeerBlockedMe;
  const peerMenuOpen = preferenceMenuOpen === "peer";
  const peerMuteBusy = activePeer ? preferenceBusyKey === `mute:dm:${activePeer.id}` : false;
  const peerBlockBusy = activePeer ? preferenceBusyKey === `block:${activePeer.id}` : false;
  const groupLeaveBusy = activeGroup
    ? preferenceBusyKey === `group:leave:${activeGroup.id}`
    : false;
  const groupDeleteBusy = activeGroup
    ? preferenceBusyKey === `group:delete:${activeGroup.id}`
    : false;
  const activeGroupCreatedByCurrentUser = activeGroup
    ? activeGroup.createdBy === currentUserId
    : false;
  const currentUserIsEmployer = Boolean(
    currentEmploymentFlags?.is_admin || currentEmploymentFlags?.is_manager,
  );
  const activePeerIsEmployer = activePeer
    ? Boolean(
        employmentMetaByUserId[activePeer.id]?.is_admin ||
          employmentMetaByUserId[activePeer.id]?.is_manager,
      )
    : false;
  const scheduleSummary = useMemo(() => {
    if (!weekSchedule.length) {
      return t("employee.messages.menu.forward.schedule.emptySummary");
    }
    return weekSchedule
      .map((slot) => `• ${slot.day} ${slot.time} – ${slot.title}`)
      .join("\n");
  }, [t, weekSchedule]);
  const scheduleCardPayload = useMemo<ScheduleCardPayload>(() => {
    const weekStart = startOfWeek(new Date());
    const weekLabel = t("employee.messages.scheduleCard.weekLabel", {
      date: new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }).format(weekStart),
    });
    return {
      type: "scheduleCard",
      weekKey: weekStart.toISOString().slice(0, 10),
      weekLabel,
      summary: scheduleSummary,
      slots: weekSchedule.slice(0, 10),
    };
  }, [locale, scheduleSummary, t, weekSchedule]);
  const scheduleReminderIdentifier = scheduleCardPayload.weekKey;
  const scheduleReminderQuota = getReminderUsageInfo(
    "schedule",
    scheduleReminderIdentifier,
  );
  const addContactResults = useMemo(() => {
    const normalizedQuery = addContactSearch.trim().toLowerCase();
    return contacts.filter((profile) => {
      if (!normalizedQuery) {
        return true;
      }
      const name = (
        profileDisplayName(profile, "") ?? ""
      ).toLowerCase();
      const email = profile.email?.toLowerCase() ?? "";
      return name.includes(normalizedQuery) || email.includes(normalizedQuery);
    });
  }, [addContactSearch, contacts]);

  async function sendMessageContent(
    rawContent: string,
    attachmentDraft?: AttachmentDraft | null,
  ) {
    if (!currentUserId) return null;
    if (!activePeer && !activeGroup) return null;
    const content = rawContent.trim();
    if (!content && !attachmentDraft) return null;
    if (activePeer && (blockedByMe[activePeer.id] || blockedMe[activePeer.id])) {
      return null;
    }

    let uploadedAttachment: UploadedAttachment | null = null;
    if (attachmentDraft) {
      try {
        uploadedAttachment = await uploadMessageAttachment(
          supabase,
          attachmentDraft.file,
          currentUserId,
          activeGroup ? "group" : "dm",
        );
      } catch (err) {
        console.error("Attachment upload failed", err);
        setAttachmentError(
          t("employee.messages.attachments.uploadError"),
        );
        return null;
      }
    }

    setAttachmentError(null);
    setSending(true);
    try {
      if (activeGroup) {
        return await sendGroupMessage(content, uploadedAttachment);
      }
      if (activePeer) {
        return await sendDirectMessage(content, uploadedAttachment);
      }
      return null;
    } finally {
      setSending(false);
    }
  }

  async function sendDirectMessage(
    content: string,
    attachment?: UploadedAttachment | null,
  ) {
    if (!currentUserId || !activePeer) return null;

    const tempId = getTempMessageId() ?? generateUuid();
    const optimisticMessage: ConversationMessage = {
      id: tempId,
      sender_id: currentUserId,
      recipient_id: activePeer.id,
      content,
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      kind: "dm",
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_path: attachment?.path ?? null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      console.log(
        "Sending message:",
        { currentUserId, sessionUserId: sessionData?.session?.user?.id },
      );
    } catch (err) {
      console.warn("Failed to read session before send", err);
    }

    const baseSelect =
      "id,sender_id,recipient_id,content,created_at,attachment_url,attachment_name,attachment_mime,attachment_size,attachment_path";
    const receiptSelect = `${baseSelect},delivered_at,read_at`;

    const performInsert = async (selectColumns: string) =>
      supabase
        .from("message")
        .insert({
          sender_id: currentUserId,
          recipient_id: activePeer.id,
          content,
          attachment_url: attachment?.url ?? null,
          attachment_name: attachment?.name ?? null,
          attachment_mime: attachment?.mime ?? null,
          attachment_size: attachment?.size ?? null,
          attachment_path: attachment?.path ?? null,
        })
        .select(selectColumns)
        .single();

    const initialSelect = receiptColumnsAvailableRef.current
      ? receiptSelect
      : baseSelect;

    let { data, error } = await performInsert(initialSelect);

    if (error && receiptColumnsAvailableRef.current && isMissingReceiptColumn(error)) {
      console.warn(
        "Message receipt columns missing; falling back to legacy insert.",
        error,
      );
      receiptColumnsAvailableRef.current = false;
      ({ data, error } = await performInsert(baseSelect));
    }

    if (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return null;
    }

    if (data) {
      const persisted = data as unknown as MessageRow;
      const savedMessage: ConversationMessage = {
        ...persisted,
        delivered_at: persisted.delivered_at ?? new Date().toISOString(),
        kind: "dm",
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? savedMessage : m))
      );

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "message",
          payload: data,
        });
      }
      return savedMessage;
    }

    return null;
  }

  async function sendGroupMessage(
    content: string,
    attachment?: UploadedAttachment | null,
  ) {
    if (!currentUserId || !activeGroup) return null;

    const tempId = generateUuid();
    const optimisticMessage: ConversationMessage = {
      id: tempId,
      sender_id: currentUserId,
      group_id: activeGroup.id,
      content,
      created_at: new Date().toISOString(),
      kind: "group",
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_path: attachment?.path ?? null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      console.log(
        "Sending group message:",
        { currentUserId, sessionUserId: sessionData?.session?.user?.id },
      );
    } catch (err) {
      console.warn("Failed to read session before group send", err);
    }

    const { data, error } = await supabase
      .from("group_message")
      .insert({
        group_id: activeGroup.id,
        sender_id: currentUserId,
        content,
        attachment_url: attachment?.url ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_mime: attachment?.mime ?? null,
        attachment_size: attachment?.size ?? null,
        attachment_path: attachment?.path ?? null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error sending group message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return null;
    }

    if (data) {
      const savedMessage: ConversationMessage = {
        ...(data as GroupMessageRow),
        kind: "group",
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? savedMessage : m))
      );
      return savedMessage;
    }

    return null;
  }

  async function sendForwardCardMessage(
    payload: Omit<ForwardCardPayload, "type">,
  ) {
    const card: ForwardCardPayload = {
      type: "forwardCard",
      requesterId: currentUserId,
      forwardedById: currentUserId,
      ...payload,
    };
    const encoded = encodeForwardCard(card);
    await sendMessageContent(encoded);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) return;
    if (!activePeer && !activeGroup) return;
    if (activePeer && activePeerBlocked) return;
    if (!newMessage.trim() && !pendingAttachment) return;
    const draftText = newMessage;
    const draftAttachment = pendingAttachment;
    const result = await sendMessageContent(draftText, draftAttachment);
    if (result) {
      setNewMessage("");
      setPendingAttachment(null);
      setAttachmentError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function insertTemplate(template: string) {
    if (!template) return;
    setNewMessage((prev) => {
      if (!prev.trim()) {
        return template;
      }
      return `${prev.trimEnd()}\n\n${template}`;
    });

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 0);
  }

  const handleAttachmentButtonClick = () => {
    if (!activePeer && !activeGroup) return;
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
      setAttachmentError(
        t("employee.messages.attachments.tooLarge", { limit: "50 MB" }),
      );
      return;
    }
    setAttachmentError(null);
    const draft: AttachmentDraft = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    };
    setPendingAttachment(draft);
  };

  const handleRemoveAttachment = () => {
    setAttachmentError(null);
    setPendingAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  function handleSelectContact(peer: Profile) {
    setIsAddContactOpen(false);
    setAddContactSearch("");
    setIsActionMenuOpen(false);
    setActiveGroup(null);
    setConversations((prev) => {
      const exists = prev.some((conv) => conv.peer.id === peer.id);
      if (exists) {
        return prev;
      }
      return sortConversationsByName([...prev, { peer, lastMessage: null }]);
    });
    setActivePeer(peer);
    setInfoPanelMode(null);
    setMobileView("chat");
  }

  function handleSelectConversation(peer: Profile) {
    setIsActionMenuOpen(false);
    setActiveGroup(null);
    setActivePeer(peer);
    setInfoPanelMode(null);
    setMobileView("chat");
  }

  function handleSelectGroup(group: GroupChat) {
    setActivePeer(null);
    setActiveGroup(group);
    setIsAddContactOpen(false);
    setAddContactSearch("");
    setIsActionMenuOpen(false);
    setInfoPanelMode(null);
    setMobileView("chat");
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
      setGroupBuilderError(t("employee.messages.groups.errors.auth"));
      return;
    }

    const trimmedName = groupDraftName.trim();
    if (!trimmedName) {
      setGroupBuilderError(t("employee.messages.groups.errors.name"));
      return;
    }

    if (trimmedName.length > GROUP_NAME_MAX) {
      setGroupBuilderError(
        t("employee.messages.groups.errors.nameLength", {
          limit: GROUP_NAME_MAX,
        }),
      );
      return;
    }

    const teammateIds = Object.entries(groupDraftMembers)
      .filter(([, selected]) => Boolean(selected))
      .map(([id]) => id as UUID);

    if (teammateIds.length < 2) {
      setGroupBuilderError(t("employee.messages.groups.errors.members"));
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
        .select("id,name,created_by")
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
      setGroupBuilderError(t("employee.messages.groups.errors.generic"));
    } finally {
      setIsCreatingGroup(false);
    }
  }

  const handleTogglePeerMute = useCallback(async () => {
    if (!activePeer) return;
    const key = `mute:dm:${activePeer.id}`;
    setPreferenceBusyKey(key);
    setPreferenceError(null);
    try {
      if (mutedPeers[activePeer.id]) {
        await unmuteThread(supabase, currentUserId, "dm", activePeer.id);
      } else {
        await muteThread(supabase, currentUserId, "dm", activePeer.id);
      }
      await refreshMessagingPreferences();
    } catch (err) {
      console.error("Failed to toggle peer mute", err);
      setPreferenceError(t("employee.messages.preferences.genericError"));
    } finally {
      setPreferenceBusyKey((prev) => (prev === key ? null : prev));
    }
  }, [
    activePeer,
    currentUserId,
    mutedPeers,
    refreshMessagingPreferences,
    supabase,
    t,
  ]);

  const handleTogglePeerBlock = useCallback(async () => {
    if (!activePeer) return;
    const key = `block:${activePeer.id}`;
    setPreferenceBusyKey(key);
    setPreferenceError(null);
    try {
      if (blockedByMe[activePeer.id]) {
        await unblockUserPreference(supabase, currentUserId, activePeer.id);
      } else {
        await blockUserPreference(supabase, currentUserId, activePeer.id);
      }
      await refreshMessagingPreferences();
    } catch (err) {
      console.error("Failed to toggle peer block", err);
      setPreferenceError(t("employee.messages.preferences.genericError"));
    } finally {
      setPreferenceBusyKey((prev) => (prev === key ? null : prev));
    }
  }, [
    activePeer,
    blockedByMe,
    currentUserId,
    refreshMessagingPreferences,
    supabase,
    t,
  ]);

  const handleLeaveGroup = useCallback(async () => {
    if (!activeGroup) return;
    const groupLabel =
      activeGroup.name || t("employee.messages.groupsHeading");
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            t("employee.messages.groups.actions.leaveConfirm", {
              name: groupLabel,
            }),
          );
    if (!confirmed) return;
    const groupId = activeGroup.id;
    const wasActiveGroup = activeGroup.id === groupId;
    const key = `group:leave:${groupId}`;
    setPreferenceBusyKey(key);
    setPreferenceError(null);
    try {
      const { error } = await leaveGroupRpc(supabase, groupId);
      if (error) throw error;
      setGroups((prev) => prev.filter((group) => group.id !== groupId));
      setActiveGroup((prev) => (prev && prev.id === groupId ? null : prev));
      if (wasActiveGroup) {
        setMessages([]);
      }
      setGroupIncomingCounts((prev) => {
        if (!prev[groupId]) return prev;
        const clone = { ...prev };
        delete clone[groupId];
        return clone;
      });
      setMutedGroups((prev) => {
        if (!prev[groupId]) return prev;
        const clone = { ...prev };
        delete clone[groupId];
        return clone;
      });
      delete groupTotalsRef.current[groupId];
      delete groupReadCountsRef.current[groupId];
      await refreshMessagingPreferences();
    } catch (err) {
      console.error("Failed to leave group", err);
      setPreferenceError(t("employee.messages.groups.actions.error"));
    } finally {
      setPreferenceBusyKey((prev) => (prev === key ? null : prev));
    }
  }, [activeGroup, refreshMessagingPreferences, setGroupIncomingCounts, supabase, t]);

  const handleDeleteGroup = useCallback(async () => {
    if (!activeGroup) return;
    const groupLabel =
      activeGroup.name || t("employee.messages.groupsHeading");
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            t("employee.messages.groups.actions.deleteConfirm", {
              name: groupLabel,
            }),
          );
    if (!confirmed) return;
    const groupId = activeGroup.id;
    const wasActiveGroup = activeGroup.id === groupId;
    const key = `group:delete:${groupId}`;
    setPreferenceBusyKey(key);
    setPreferenceError(null);
    try {
      const { error } = await deleteGroupThread(supabase, groupId);
      if (error) throw error;
      setGroups((prev) => prev.filter((group) => group.id !== groupId));
      setActiveGroup((prev) => (prev && prev.id === groupId ? null : prev));
      if (wasActiveGroup) {
        setMessages([]);
      }
      setGroupIncomingCounts((prev) => {
        if (!prev[groupId]) return prev;
        const clone = { ...prev };
        delete clone[groupId];
        return clone;
      });
      setMutedGroups((prev) => {
        if (!prev[groupId]) return prev;
        const clone = { ...prev };
        delete clone[groupId];
        return clone;
      });
      delete groupTotalsRef.current[groupId];
      delete groupReadCountsRef.current[groupId];
      await refreshMessagingPreferences();
    } catch (err) {
      console.error("Failed to delete group", err);
      setPreferenceError(t("employee.messages.groups.actions.error"));
    } finally {
      setPreferenceBusyKey((prev) => (prev === key ? null : prev));
    }
  }, [activeGroup, refreshMessagingPreferences, setGroupIncomingCounts, supabase, t]);

  const handleRemoveGroupMember = useCallback(
    async (memberId: UUID, memberName: string) => {
      if (!activeGroup) return;
      const confirmLabel = t(
        "employee.messages.groups.actions.removeConfirm",
        {
          name:
            memberName || t("employee.messages.groups.unknownMember"),
        },
      );
      const confirmed =
        typeof window === "undefined" ? true : window.confirm(confirmLabel);
      if (!confirmed) return;
      const key = `group:remove:${memberId}`;
      const groupId = activeGroup.id;
      setPreferenceBusyKey(key);
      setPreferenceError(null);
      try {
        const { error } = await removeGroupMember(
          supabase,
          groupId,
          memberId,
        );
        if (error) throw error;
        setGroups((prev) =>
          prev.map((group) =>
            group.id === groupId
              ? { ...group, memberIds: group.memberIds.filter((id) => id !== memberId) }
              : group,
          ),
        );
        setActiveGroup((prev) => {
          if (!prev || prev.id !== groupId) return prev;
          return {
            ...prev,
            memberIds: prev.memberIds.filter((id) => id !== memberId),
          };
        });
      } catch (err) {
        console.error("Failed to remove group member", err);
        setPreferenceError(t("employee.messages.groups.actions.error"));
      } finally {
        setPreferenceBusyKey((prev) => (prev === key ? null : prev));
      }
    },
    [activeGroup, supabase, t],
  );

  function getReminderUsageInfo(
    requestType: ReminderRequestType,
    identifier: string,
  ): ReminderQuota {
    if (!activePeer || !reminderTrackingEnabled) {
      return {
        count: 0,
        remaining: REMINDER_LIMIT_PER_REQUEST,
        limit: REMINDER_LIMIT_PER_REQUEST,
        reached: false,
      };
    }
    const key = buildReminderKey(requestType, identifier, activePeer.id);
    const existing = reminderUsage[key];
    const count = existing?.send_count ?? 0;
    const remaining = Math.max(0, REMINDER_LIMIT_PER_REQUEST - count);
    return {
      count,
      remaining,
      limit: REMINDER_LIMIT_PER_REQUEST,
      reached: remaining <= 0,
    };
  }

  async function recordReminderUsage(
    requestType: ReminderRequestType,
    identifier: string,
  ) {
    if (!currentUserId || !activePeer) return;
    try {
      const key = buildReminderKey(requestType, identifier, activePeer.id);
      const existing = reminderUsage[key];
      const payload = {
        sender_id: currentUserId,
        recipient_id: activePeer.id,
        request_type: requestType,
        request_identifier: identifier,
        send_count: (existing?.send_count ?? 0) + 1,
        last_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from(REMINDER_LOG_TABLE)
        .upsert(payload, {
          onConflict:
            "sender_id,recipient_id,request_type,request_identifier",
        })
        .select(
          "sender_id,recipient_id,request_type,request_identifier,send_count,last_sent_at",
        )
        .single();

      if (error) throw error;
      const typed = data as ReminderLogRow;
      setReminderUsage((prevMap) => ({ ...prevMap, [key]: typed }));
    } catch (err) {
      console.error("Failed to record reminder usage:", err);
      if (isMissingRelationError(err, REMINDER_LOG_TABLE)) {
        setReminderTrackingEnabled(false);
      }
    }
  }

  async function handleReminderAction(params: {
    requestType: ReminderRequestType;
    identifier: string;
    template: string;
  }) {
    insertTemplate(params.template);
    setIsActionMenuOpen(false);
    if (!reminderTrackingEnabled) return;
    await recordReminderUsage(params.requestType, params.identifier);
  }

  function getStatusLabel(status: string | null | undefined) {
    if (!status) return t("shared.status.pending");
    return t(`shared.status.${status}`);
  }

  async function handleTimeOffReminder(request: TimeOffRequestSummary) {
    if (!activePeer) return;
    const identifier = request.id;
    const quota = getReminderUsageInfo("timeOff", identifier);
    if (quota.reached) return;
    const range = formatTimeOffRange(request.start_ts, request.end_ts, locale);
    const statusLabel = getStatusLabel(request.status);
    const reasonText = request.reason?.trim();
    const reasonLine = reasonText
      ? `\n\n${t("shared.labels.reason")}: ${reasonText}`
      : "";
    const template = t("employee.messages.menu.reminders.timeOff.template", {
      name: resolvedPeerName,
      range,
      status: statusLabel,
      reasonLine,
    });
    await handleReminderAction({
      requestType: "timeOff",
      identifier,
      template,
    });
  }

  async function handleAvailabilityReminder(
    request: AvailabilityRequestSummary,
  ) {
    if (!activePeer) return;
    const identifier = request.id;
    const quota = getReminderUsageInfo("availability", identifier);
    if (quota.reached) return;
    const range = formatAvailabilityRange(
      request.effective_from,
      request.effective_to,
      locale,
    );
    const statusLabel = getStatusLabel(request.status ?? "pending");
    const reasonText =
      extractAvailabilityReason(request.weekly_pattern_json ?? null) ?? "";
    const reasonLine = reasonText
      ? `\n\n${t("shared.labels.reason")}: ${reasonText}`
      : "";
    const template = t(
      "employee.messages.menu.reminders.availability.template",
      {
        name: resolvedPeerName,
        range,
        status: statusLabel,
        reasonLine,
      },
    );
    await handleReminderAction({
      requestType: "availability",
      identifier,
      template,
    });
  }

  async function handleScheduleReminder() {
    if (!activePeer || !activePeerIsEmployer) return;
    const identifier = scheduleReminderIdentifier;
    const quota = getReminderUsageInfo("schedule", identifier);
    if (quota.reached) return;
    const encoded = encodeScheduleCard(scheduleCardPayload);
    setIsActionMenuOpen(false);
    const result = await sendMessageContent(encoded);
    if (result && reminderTrackingEnabled) {
      await recordReminderUsage("schedule", identifier);
    }
  }

  function handleScheduleModifyClick(payload: ScheduleCardPayload) {
    if (!currentUserIsEmployer) return;
    setScheduleModalState({
      payload,
      employeeName: resolvedPeerName,
    });
  }

  function closeScheduleModal() {
    setScheduleModalState(null);
  }

  const ScheduleCardBlock = ({
    payload,
    showModifyButton = false,
    variant = "bubble",
    onModify,
  }: {
    payload: ScheduleCardPayload;
    showModifyButton?: boolean;
    variant?: "bubble" | "preview";
    onModify?: () => void;
  }) => {
    const wrapperClass =
      variant === "preview"
        ? "border border-border bg-white text-foreground shadow-sm dark:bg-slate-900"
        : "border border-border/60 bg-card text-foreground shadow-sm";
    const showModifyCta = showModifyButton && typeof onModify === "function";
    return (
      <div className="space-y-3 text-foreground">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {t("employee.messages.scheduleCard.title")}
            </p>
            <p className="text-[11px] text-primary/80">{payload.weekLabel}</p>
          </div>
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>
        <div className={cn("rounded-lg px-3 py-2 text-xs", wrapperClass)}>
          {payload.slots?.length ? (
            <ul className="space-y-2">
              {payload.slots.map((slot, index) => (
                <li
                  key={`${slot.day}-${index}`}
                  className="flex items-start justify-between gap-3"
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
              {t("employee.messages.scheduleCard.empty")}
            </p>
          )}
        </div>
        {!payload.slots?.length && (
          <p className="text-[11px] text-muted-foreground whitespace-pre-line">
            {payload.summary}
          </p>
        )}
        {showModifyCta ? (
          <button
            type="button"
            onClick={onModify}
            className={cn(
              "rounded-full border border-primary/40 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10",
              variant === "preview"
                ? "mt-2 flex w-full items-center justify-center"
                : "inline-flex items-center justify-center",
            )}
          >
            {t("employee.messages.scheduleCard.modifyButton")}
          </button>
        ) : null}
      </div>
    );
  };

  const ForwardCardBlock = ({
    payload,
    statusOverride,
  }: {
    payload: ForwardCardPayload;
    statusOverride?: string | null;
  }) => {
    const typeLabel =
      payload.requestType === "timeOff"
        ? t("employee.messages.forwardCard.type.timeOff")
        : t("employee.messages.forwardCard.type.availability");
    const statusLabel = getStatusLabel(statusOverride ?? payload.status ?? "pending");
    return (
      <div className="space-y-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              {t("employee.messages.forwardCard.title")}
            </p>
            <p className="text-[11px] text-muted-foreground">{typeLabel}</p>
          </div>
          <Share2 className="h-4 w-4 text-primary" />
        </div>
        <dl className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">
              {t("employee.messages.forwardCard.rangeLabel")}
            </dt>
            <dd className="text-right font-semibold">{payload.rangeLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">
              {t("employee.messages.forwardCard.statusLabel")}
            </dt>
            <dd className="text-right text-foreground">{statusLabel}</dd>
          </div>
          {payload.reason ? (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">
                {t("employee.messages.forwardCard.reasonLabel")}
              </dt>
              <dd className="whitespace-pre-line text-foreground">{payload.reason}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("employee.messages.forwardCard.forwardedLabel")}
        </p>
      </div>
    );
  };

  function handleForwardTimeOff(request: TimeOffRequestSummary) {
    if (!activePeer) return;
    const range = formatTimeOffRange(request.start_ts, request.end_ts, locale);
    const statusLabel = getStatusLabel(request.status);
    const reasonText = request.reason?.trim();
    const reasonLine = reasonText
      ? `\n${t("shared.labels.reason")}: ${reasonText}`
      : "";
    const template = t("employee.messages.menu.forward.timeOff.template", {
      name: resolvedPeerName,
      range,
      status: statusLabel,
      reasonLine,
    });
    insertTemplate(template);
    sendForwardCardMessage({
      requestType: "timeOff",
      requestId: request.id,
      status: request.status,
      statusLabel,
      rangeLabel: range,
      submittedAt: request.start_ts,
      reason: reasonText ?? null,
      requesterId: currentUserId,
    }).catch((err) => {
      console.error("Error sending time off forward card", err);
    });
    setIsActionMenuOpen(false);
  }

  function handleForwardAvailability(request: AvailabilityRequestSummary) {
    if (!activePeer) return;
    const range = formatAvailabilityRange(
      request.effective_from,
      request.effective_to,
      locale,
    );
    const statusLabel = getStatusLabel(request.status ?? "pending");
    const reasonText =
      extractAvailabilityReason(request.weekly_pattern_json ?? null) ?? "";
    const reasonLine = reasonText
      ? `\n${t("shared.labels.reason")}: ${reasonText}`
      : "";
    const template = t(
      "employee.messages.menu.forward.availability.template",
      {
        name: resolvedPeerName,
        range,
        status: statusLabel,
        reasonLine,
      },
    );
    insertTemplate(template);
    sendForwardCardMessage({
      requestType: "availability",
      requestId: request.id,
      status: request.status ?? "pending",
      statusLabel,
      rangeLabel: range,
      submittedAt: request.effective_from,
      reason: reasonText || null,
      requesterId: currentUserId,
    }).catch((err) => {
      console.error("Error sending availability forward card", err);
    });
    setIsActionMenuOpen(false);
  }

  function handleForwardSchedule() {
    if (!activePeer || !activePeerIsEmployer) return;
    const template = t("employee.messages.menu.forward.schedule.template", {
      name: resolvedPeerName,
      summary: scheduleSummary,
    });
    insertTemplate(template);
    setIsActionMenuOpen(false);
  }

  function handlePeerTimeOffShare(request: TimeOffRequestSummary) {
    if (!activePeer) return;
    const range = formatTimeOffRange(request.start_ts, request.end_ts, locale);
    const statusLabel = getStatusLabel(request.status);
    const reasonText = request.reason?.trim();
    const reasonLine = reasonText
      ? `\n${t("shared.labels.reason")}: ${reasonText}`
      : "";
    const template = t("employee.messages.menu.peerRequests.timeOff.template", {
      name: resolvedPeerName,
      range,
      status: statusLabel,
      reasonLine,
    });
    insertTemplate(template);
    setIsActionMenuOpen(false);
  }

  function handlePeerAvailabilityShare(request: AvailabilityRequestSummary) {
    if (!activePeer) return;
    const range = formatAvailabilityRange(
      request.effective_from,
      request.effective_to,
      locale,
    );
    const statusLabel = getStatusLabel(request.status ?? "pending");
    const reasonText =
      extractAvailabilityReason(request.weekly_pattern_json ?? null) ?? "";
    const reasonLine = reasonText
      ? `\n${t("shared.labels.reason")}: ${reasonText}`
      : "";
    const template = t(
      "employee.messages.menu.peerRequests.availability.template",
      {
        name: resolvedPeerName,
        range,
        status: statusLabel,
        reasonLine,
      },
    );
    insertTemplate(template);
    setIsActionMenuOpen(false);
  }

  function handleDroppedShiftAsk() {
    if (!activePeer) return;
    const template = t("employee.messages.actions.requestTemplate", {
      name: resolvedPeerName,
    });
    insertTemplate(template);
    setIsActionMenuOpen(false);
  }

  function handleDroppedShiftPickup() {
    if (!activePeer) return;
    const template = t("employee.messages.actions.offerTemplate", {
      name: resolvedPeerName,
    });
    insertTemplate(template);
    setIsActionMenuOpen(false);
  }

  function handleSendButtonContextMenu(
    event: React.MouseEvent<HTMLButtonElement | HTMLDivElement>,
  ) {
    if (!activePeer) return;
    event.preventDefault();
    setIsActionMenuOpen(true);
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

  const headerTitle = useMemo(() => {
    if (activeGroup) return activeGroup.name;
    if (activePeer) {
      const resolved = profileDisplayName(
        activePeer,
        t("employee.messages.conversationFallback"),
      );
      return resolved || t("employee.messages.conversationFallback");
    }
    return t("employee.messages.title");
  }, [activeGroup, activePeer, t]);

  const headerSubtitle = useMemo(() => {
    if (activeGroup) {
      return t("employee.messages.header.groupSubtitle", {
        count: activeGroup.memberIds.length,
      });
    }
    if (activePeer) {
      return t("employee.messages.header.directSubtitle", {
        email: activePeer.email ?? t("employee.messages.unknownEmail"),
      });
    }
    return t("employee.messages.header.emptySubtitle");
  }, [activeGroup, activePeer, t]);
  const composerBlocked = Boolean(activePeer && activePeerBlocked);
  const composerPlaceholder = composerBlocked
    ? t("employee.messages.preferences.blockedPlaceholder")
    : activePeer
      ? t("employee.messages.placeholderWithPeer", {
          name: resolvedPeerName,
        })
      : activeGroup
        ? t("employee.messages.placeholderWithGroup", {
            name: activeGroup.name,
          })
        : t("employee.messages.placeholderWithoutPeer");
  const composerDisabled =
    (!activePeer && !activeGroup) || sending || composerBlocked;
  const sendDisabled =
    composerDisabled || (!newMessage.trim() && !pendingAttachment);

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
          <p className="text-lg font-semibold">
            {t("employee.messages.auth.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("employee.messages.auth.subtitle")}
          </p>
        </div>
      </div>
    );
  }

  const showBackButton = isMobileLayout && mobileView === "chat";
  const layoutShellClassName = cn(
    "flex w-full bg-background overflow-hidden",
    isMobileLayout
      ? "min-h-screen flex-col"
      : "h-[calc(100vh-4rem)] min-h-[600px] gap-4 lg:gap-12",
  );
  const sidebarClassName = cn(
    "flex flex-col bg-card/60 backdrop-blur-sm",
    isMobileLayout
      ? "w-full border-b border-border/60"
      : "w-64 shrink-0 border-r border-border/60",
    isMobileLayout && mobileView === "chat" && "hidden",
  );
  const chatPanelClassName = cn(
    "flex min-h-0 min-w-0 flex-1 flex-col bg-background",
    isMobileLayout && mobileView === "list" && "hidden",
  );
  const showPeerInfo = infoPanelMode === "peer" && Boolean(activePeer);
  const showGroupInfo = infoPanelMode === "group" && Boolean(activeGroup);
  const closeInfoPanel = () => setInfoPanelMode(null);
  const infoPanelTitle = showPeerInfo
    ? activePeerDisplayName ?? t("employee.messages.unknown")
    : showGroupInfo
      ? activeGroup?.name ?? t("employee.messages.groups.detailsTitle")
      : "";
  const infoPanelSubtitle = showPeerInfo
    ? t("employee.messages.conversation.title")
    : showGroupInfo
      ? t("employee.messages.groups.detailsTitle")
      : "";

  return (
    <div className={layoutShellClassName}>
      <div className="flex h-full flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className={sidebarClassName}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="relative">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-semibold">
              {t("employee.messages.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("employee.messages.subtitle")}
            </p>
          </div>
          {hasUnreadMessages ? (
            <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 animate-pulse">
              {unreadBadgeLabel} new
            </span>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3">
            <div className="relative mb-1 px-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  {t("employee.messages.directHeading")}
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
                    aria-label={t("employee.messages.directAddButton")}
                    aria-expanded={isAddContactOpen}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {isAddContactOpen && (
                <div
                  ref={addContactPanelRef}
                  className="absolute right-0 top-6 z-30 w-64 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xl"
                >
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                    {t("employee.messages.directAddTitle")}
                  </p>
                  <input
                    type="search"
                    value={addContactSearch}
                    onChange={(event) => setAddContactSearch(event.target.value)}
                    placeholder={t("employee.messages.directAddSearchPlaceholder")}
                    className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto">
                    {addContactResults.length ? (
                      <ul className="max-h-[40vh] space-y-1 overflow-y-auto pr-1">
                        {addContactResults.map((profile) => (
                          <li key={profile.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectContact(profile)}
                              className="w-full rounded-md px-2 py-1 text-left text-xs transition hover:bg-muted"
                            >
                              <span className="block font-semibold">
                                {profileDisplayName(
                                  profile,
                                  t("employee.messages.directAddFallback"),
                                ) || t("employee.messages.directAddFallback")}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {profile.email || t("employee.messages.unknownEmail")}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {t("employee.messages.directAddEmpty")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {conversations.length === 0 && !isLoadingContacts && (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                {t("employee.messages.directEmpty")}
              </p>
            )}

            <ul className="space-y-1 pb-3">
              {conversations.map((conv) => {
                const isActive = !activeGroup && activePeer?.id === conv.peer.id;
                const incomingCount = incomingCounts[conv.peer.id] ?? 0;
                const peerProfile = conv.peer ?? null;
                const isMuted = Boolean(mutedPeers[conv.peer.id]);
                const isBlockedOutbound = Boolean(blockedByMe[conv.peer.id]);
                const isBlockedInbound = Boolean(blockedMe[conv.peer.id]);
                const displayIncomingCount = isMuted ? 0 : incomingCount;

                return (
                  <li key={conv.peer.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectConversation(conv.peer)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary-foreground/90"
                          : "hover:bg-muted",
                        isMuted && !isActive ? "opacity-70" : "",
                      ].join(" ")}
                    >
                      <AvatarCircle profile={peerProfile} sizeClass="h-8 w-8 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {profileDisplayName(
                            conv.peer,
                            t("employee.messages.conversationFallback"),
                          )}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {conv.lastMessage?.content ||
                            t("employee.messages.startConversation")}
                        </p>
                        {isMuted && (
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("employee.messages.preferences.silencedBadge")}
                          </p>
                        )}
                        {(isBlockedOutbound || isBlockedInbound) && (
                          <p className="text-[10px] text-amber-600">
                            {isBlockedOutbound
                              ? t("employee.messages.preferences.blockedByYouBadge")
                              : t("employee.messages.preferences.blockedYouBadge")}
                          </p>
                        )}
                      </div>
                      {displayIncomingCount > 0 && (
                        <span className="ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full border border-rose-300 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-400/60 dark:text-rose-200">
                          {displayIncomingCount > 9 ? "9+" : displayIncomingCount}
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
                  {t("employee.messages.groupsHeading")}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleGroupBuilder}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {isGroupBuilderOpen
                  ? t("employee.messages.groupsBuilder.cancel")
                  : t("employee.messages.groupsBuilder.new")}
              </button>
            </div>
            {isGroupBuilderOpen && (
              <div className="mb-3 rounded-lg border border-border/70 bg-card/60 p-3 text-xs">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("employee.messages.groupsBuilder.nameLabel")}
                  <input
                    type="text"
                    value={groupDraftName}
                    maxLength={GROUP_NAME_MAX}
                    onChange={(event) => setGroupDraftName(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                    placeholder={t("employee.messages.groupsBuilder.namePlaceholder")}
                  />
                </label>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {t("employee.messages.groupsBuilder.helper", {
                    count: groupDraftSelectionCount,
                  })}
                </p>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-md border border-dashed border-border/70 p-2">
                  {contacts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {t("employee.messages.groupsBuilder.emptyContacts")}
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
                        />
                        <span className="truncate">
                          {profileDisplayName(
                            profile,
                            t("employee.messages.directAddFallback"),
                          ) || t("employee.messages.directAddFallback")}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {groupBuilderError && (
                  <p className="mt-2 text-[11px] text-rose-600">{groupBuilderError}</p>
                )}
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={!contacts.length || isCreatingGroup}
                  className="mt-3 w-full rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {isCreatingGroup ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t("employee.messages.groupsBuilder.cta")}
                    </span>
                  ) : (
                    t("employee.messages.groupsBuilder.cta")
                  )}
                </button>
              </div>
            )}
            {isLoadingGroups ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                {t("shared.state.loading")}
              </p>
            ) : groups.length === 0 ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                {t("employee.messages.groupsEmpty")}
              </p>
            ) : (
              <ul className="space-y-2 px-1 text-xs">
                {groups.map((group) => {
                  const memberNames = group.memberIds
                    .map((id) => {
                      const profile = profileById.get(id);
                      if (!profile) return null;
                      if (profile.id === currentUserId) {
                        return t("employee.messages.youLabel");
                      }
                      return (
                        profileDisplayName(
                          profile,
                          t("employee.messages.groups.unknownMember"),
                        ) || t("employee.messages.groups.unknownMember")
                      );
                    })
                    .filter(Boolean) as string[];
                  const previewNames = memberNames.slice(0, 3).join(", ");
                  const remaining = Math.max(0, memberNames.length - 3);
                  const remainderLabel =
                    remaining > 0
                      ? t("employee.messages.groupsBuilder.moreMembers", { count: remaining })
                      : "";
                  const isActive = activeGroup?.id === group.id;
                  const unreadCount = groupIncomingCounts[group.id] ?? 0;
                  const isMutedGroup = Boolean(mutedGroups[group.id]);
                  const displayUnread = isMutedGroup ? 0 : unreadCount;
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
                          isMutedGroup && !isActive ? "opacity-75" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{group.name}</p>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {t("employee.messages.groups.memberCount", {
                                count: group.memberIds.length,
                              })}
                            </span>
                            {displayUnread > 0 && (
                              <span className="inline-flex min-w-[1.5rem] justify-center rounded-full border border-rose-300 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-400/60 dark:text-rose-200">
                                {displayUnread > 9 ? "9+" : displayUnread}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {previewNames || t("employee.messages.groupsBuilder.membersPending")}
                          {remainderLabel ? ` ${remainderLabel}` : ""}
                        </p>
                        {isMutedGroup && (
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("employee.messages.preferences.silencedBadge")}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {(showPeerInfo || showGroupInfo) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-6 sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeInfoPanel();
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-5 text-sm shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {infoPanelTitle}
                </h2>
                {infoPanelSubtitle ? (
                  <p className="text-xs text-muted-foreground">
                    {infoPanelSubtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeInfoPanel}
                aria-label={t("shared.buttons.close")}
                className="rounded-full border border-border/60 p-2 text-muted-foreground transition hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {infoPanelMode === "peer" && activePeer ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <AvatarCircle
                    profile={activePeer}
                    sizeClass="h-14 w-14"
                    className="text-base font-semibold"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {activePeerDisplayName ?? t("employee.messages.unknown")}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {activePeer.email ?? t("employee.messages.unknownEmail")}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    {t("employee.messages.conversation.role", {
                      role:
                        activePeerRole ??
                        t("employee.messages.conversation.roleFallback"),
                    })}
                  </p>
                  <p>
                    {t("employee.messages.conversation.location", {
                      location:
                        activePeerLocation ??
                        t("employee.messages.conversation.locationFallback"),
                    })}
                  </p>
                  <p className="leading-snug text-foreground">
                    {activePeerSummary ?? t("employee.messages.conversation.bio")}
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleTogglePeerMute}
                    disabled={peerMuteBusy}
                    className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-left font-semibold transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                  >
                    {activePeerMuted
                      ? t("employee.messages.preferences.unsilenceButton")
                      : t("employee.messages.preferences.silenceButton")}
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePeerBlock}
                    disabled={peerBlockBusy}
                    className="w-full rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-left font-semibold text-rose-700 transition hover:border-rose-300 disabled:opacity-60"
                  >
                    {activePeerBlockedByMe
                      ? t("employee.messages.preferences.unblockButton")
                      : t("employee.messages.preferences.blockButton")}
                  </button>
                  {activePeerBlocked && (
                    <p className="text-[11px] text-amber-600">
                      {activePeerBlockedByMe
                        ? t("employee.messages.preferences.blockedByYouNotice", {
                            name: resolvedPeerName,
                          })
                        : t("employee.messages.preferences.blockedYouNotice", {
                            name: resolvedPeerName,
                          })}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {infoPanelMode === "group" && activeGroup ? (
              <div className="mt-4 space-y-3 text-xs text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">
                  {t("employee.messages.groups.detailsMembers", {
                    count: activeGroup.memberIds.length,
                  })}
                </p>
                <ul className="space-y-1">
                  {activeGroup.memberIds.map((memberId) => {
                    const profile = profileById.get(memberId);
                    const label =
                      memberId === currentUserId
                        ? t("employee.messages.youLabel")
                        : profileDisplayName(
                            profile,
                            t("employee.messages.groups.unknownMember"),
                          ) || t("employee.messages.groups.unknownMember");
                    return (
                      <li key={memberId} className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-card/50 px-2 py-1.5">
                        <span className="truncate text-foreground">{label}</span>
                        {memberId === currentUserId ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("shared.labels.you")}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <div className="space-y-2 text-sm">
                  <button
                    type="button"
                    onClick={handleLeaveGroup}
                    disabled={groupLeaveBusy}
                    className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-left font-semibold transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                  >
                    {t("employee.messages.groups.actions.leave")}
                  </button>
                  {activeGroupCreatedByCurrentUser && (
                    <button
                      type="button"
                      onClick={handleDeleteGroup}
                      disabled={groupDeleteBusy}
                      className="w-full rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-left font-semibold text-rose-700 transition hover:border-rose-300 disabled:opacity-60"
                    >
                      {t("employee.messages.groups.actions.delete")}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Main chat panel */}
      <main className={chatPanelClassName}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-3 py-1.5 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 sm:py-2">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {showBackButton ? (
                <button
                  type="button"
                  onClick={() => {
                    closeInfoPanel();
                    setMobileView("list");
                  }}
                  className="rounded-full border border-border/60 p-1.5 text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t("shared.buttons.back")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              {(activePeer || activeGroup) && (
                <button
                  type="button"
                  onClick={() =>
                    setInfoPanelMode(activePeer ? "peer" : "group")
                  }
                  className="rounded-full border border-border/60 p-1 text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={activePeer
                    ? t("employee.messages.conversation.title")
                    : t("employee.messages.groupsHeading")}
                >
                  {activePeer ? (
                    <AvatarCircle
                      profile={activePeer}
                      sizeClass="h-9 w-9 sm:h-10 sm:w-10"
                      className="text-sm font-semibold"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center">
                      <Users className="h-5 w-5" />
                    </div>
                  )}
                </button>
              )}
              <div className="min-w-0 leading-tight">
                <h2 className="truncate text-[13px] font-semibold">{headerTitle}</h2>
                {headerSubtitle ? (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {headerSubtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>{t("employee.messages.status.online")}</span>
            </div>
          </header>

          <div
            ref={messageContainerRef}
            className="flex-1 min-h-0 overflow-y-auto bg-muted/40 px-4 py-3"
            onScroll={handleMessageScroll}
          >
            {!activePeer && !activeGroup ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground" />
                <p>{t("employee.messages.selectPrompt")}</p>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-2">
              {!initialMessagesLoaded && (
                <ConversationSkeleton
                  rows={4}
                  label={t("shared.messages.loadingSkeleton")}
                />
              )}

              {initialMessagesLoaded && displayedMessages.length === 0 && (
                <div className="mt-4 text-xs text-muted-foreground">
                  {activeGroup
                    ? t("employee.messages.groups.emptyConversation")
                    : t("employee.messages.emptyConversation")}
                </div>
              )}

              {activePeer && activePeerBlocked && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {activePeerBlockedByMe
                    ? t("employee.messages.preferences.blockedByYouNotice", {
                        name: resolvedPeerName,
                      })
                    : t("employee.messages.preferences.blockedYouNotice", {
                        name: resolvedPeerName,
                      })}
                </div>
              )}

              {displayedMessages.map((msg) => {
                const isMine = msg.sender_id === currentUserId;
                const isGroupMessage = msg.kind === "group";
                const senderProfile = profileById.get(msg.sender_id) ?? null;
                const senderLabel =
                  !isMine && isGroupMessage
                    ? profileDisplayName(
                        senderProfile,
                        t("employee.messages.groups.unknownMember"),
                      ) || t("employee.messages.groups.unknownMember")
                    : null;
                const scheduleCard = parseScheduleCard(msg.content);
                const forwardCard = parseForwardCard(msg.content);
                const bubbleShapeClass = isMine ? "rounded-br-sm" : "rounded-bl-sm";
                const bubbleToneClass = scheduleCard || forwardCard
                  ? "bg-card text-foreground border border-border/60"
                  : isMine
                    ? "bg-primary text-primary-foreground"
                    : "bg-card";
                const statusOverride = forwardCard
                  ? forwardStatusMap[forwardCard.requestId]
                  : undefined;
                const timeLabel = new Date(msg.created_at).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const statusLabel =
                  isMine && msg.kind === "dm"
                    ? msg.read_at
                      ? t("employee.messages.status.read")
                      : msg.delivered_at
                        ? t("employee.messages.status.delivered")
                        : t("employee.messages.status.sending")
                    : null;
                const metaRowClass = [
                  "mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/80",
                  isMine ? "justify-end" : "justify-start",
                ].join(" ");
                return (
                  <div
                    key={`${msg.kind}-${msg.id}`}
                    className={[
                      "flex w-full items-end gap-2",
                      isMine ? "justify-end" : "justify-start",
                    ].join(" ")}
                  >
                    {!isMine && (
                      <AvatarCircle profile={senderProfile} sizeClass="h-8 w-8 shrink-0" />
                    )}
                    <div
                      className={[
                        "max-w-[92%] rounded-2xl px-3 py-2 text-xs shadow-sm",
                        bubbleShapeClass,
                        bubbleToneClass,
                      ].join(" ")}
                    >
                      {!isMine && senderLabel ? (
                        <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                          {senderLabel}
                        </div>
                      ) : null}
                      {msg.attachment_url ? (
                        <AttachmentPreview
                          url={msg.attachment_url}
                          name={msg.attachment_name}
                          mime={msg.attachment_mime ?? undefined}
                          size={msg.attachment_size ?? undefined}
                          downloadLabel={t(
                            "employee.messages.attachments.download",
                          )}
                        />
                      ) : null}
                      {scheduleCard ? (
                        <ScheduleCardBlock
                          payload={scheduleCard}
                          showModifyButton={currentUserIsEmployer}
                          onModify={
                            currentUserIsEmployer
                              ? () => handleScheduleModifyClick(scheduleCard)
                              : undefined
                          }
                        />
                      ) : forwardCard ? (
                        <ForwardCardBlock
                          payload={forwardCard}
                          statusOverride={statusOverride}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      )}
                      <div className={metaRowClass}>
                        {statusLabel ? (
                          <span className="font-semibold">
                            {statusLabel}
                          </span>
                        ) : null}
                        <span>{timeLabel}</span>
                      </div>
                    </div>
                    {isMine && (
                      <AvatarCircle profile={senderProfile} sizeClass="h-8 w-8 shrink-0" />
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
                    <span className="sr-only">
                      {t("employee.messages.peerTyping")}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messageEndRef} />
            </div>
            )}
          </div>

        <footer className="border-t bg-background/80 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.15rem)] sm:px-4 sm:pt-3 sm:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <div ref={actionMenuAnchorRef} className="relative">
            {pendingAttachment && (
              <div className="mb-2 flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs">
                {pendingAttachment.previewUrl ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-background">
                    <Image
                      src={pendingAttachment.previewUrl}
                      alt={pendingAttachment.file.name}
                      fill
                      unoptimized
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {pendingAttachment.file.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(pendingAttachment.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                  aria-label={t("employee.messages.attachments.remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white dark:bg-slate-800 px-3 py-1.5 sm:py-2.5 shadow-sm"
            >
              <textarea
                ref={textareaRef}
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-white dark:bg-slate-900 text-sm outline-none placeholder:text-xs placeholder:text-muted-foreground border border-gray-200 dark:border-slate-700 rounded-md px-3 py-2"
                placeholder={composerPlaceholder}
                value={newMessage}
                onChange={handleTextareaChange}
                disabled={composerDisabled}
              />
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleAttachmentButtonClick}
                  disabled={composerDisabled}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                  aria-label={t("employee.messages.attachments.add")}
                  title={t("employee.messages.attachments.add")}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleAttachmentChange}
                />
              </div>
              <div className="flex flex-col items-center">
                <button
                  type="submit"
                  onContextMenu={handleSendButtonContextMenu}
                  disabled={sendDisabled}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs disabled:opacity-50"
                  aria-label={t("employee.messages.sendButton")}
                  title={t("employee.messages.menu.rightClickHint")}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
            {attachmentError && (
              <p className="mt-2 text-xs text-destructive">{attachmentError}</p>
            )}
            {isActionMenuOpen && activePeer && (
              <div
                ref={actionMenuPanelRef}
                className="absolute bottom-16 right-0 z-20 w-[22rem] max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-white p-3 text-xs shadow-2xl dark:bg-slate-900"
              >
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-muted-foreground">
                  <span>{t("employee.messages.menu.title")}</span>
                  <button
                    type="button"
                    aria-label={t("shared.buttons.close")}
                    onClick={() => setIsActionMenuOpen(false)}
                    className="rounded-full p-1 text-muted-foreground transition hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("employee.messages.menu.helper")}
                </p>
                <div className="mt-3 space-y-4">
                  {activePeerIsEmployer ? (
                    <>
                      <section>
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          <BellRing className="h-3.5 w-3.5" />
                          <span>{t("employee.messages.menu.reminders.title")}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("employee.messages.menu.reminders.helper")}
                        </p>
                        {isLoadingRequestData ? (
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t("shared.state.loading")}
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {timeOffRequests.length === 0 &&
                            availabilityRequests.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                                {t("employee.messages.menu.reminders.empty")}
                              </p>
                            ) : (
                              <>
                                {timeOffRequests.map((request) => {
                                  const quota = getReminderUsageInfo(
                                    "timeOff",
                                    request.id,
                                  );
                                  return (
                                    <button
                                      key={request.id}
                                      type="button"
                                      onClick={() => handleTimeOffReminder(request)}
                                      disabled={!activePeer || quota.reached}
                                      className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                                        <span>
                                          {t("employee.messages.menu.reminders.timeOffBadge")}
                                          {" "}· {formatTimeOffRange(
                                            request.start_ts,
                                            request.end_ts,
                                            locale,
                                          )}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {getStatusLabel(request.status)}
                                        </span>
                                      </div>
                                      {request.reason && (
                                        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                                          {request.reason}
                                        </p>
                                      )}
                                      {reminderTrackingEnabled && (
                                        <p className="mt-1 text-[10px] text-muted-foreground">
                                          {t(
                                            "employee.messages.menu.reminders.limitUsage",
                                            {
                                              count: quota.count,
                                              limit: quota.limit,
                                            },
                                          )}
                                        </p>
                                      )}
                                      {quota.reached && (
                                        <p className="text-[10px] text-amber-600">
                                          {t(
                                            "employee.messages.menu.reminders.limitReached",
                                          )}
                                        </p>
                                      )}
                                    </button>
                                  );
                                })}
                                {availabilityRequests.map((request) => {
                                  const quota = getReminderUsageInfo(
                                    "availability",
                                    request.id,
                                  );
                                  const reason =
                                    extractAvailabilityReason(
                                      request.weekly_pattern_json ?? null,
                                    ) ?? "";
                                  return (
                                    <button
                                      key={request.id}
                                      type="button"
                                      onClick={() =>
                                        handleAvailabilityReminder(request)
                                      }
                                      disabled={!activePeer || quota.reached}
                                      className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                                        <span>
                                          {t(
                                            "employee.messages.menu.reminders.availabilityBadge",
                                          )}
                                          {" "}· {formatAvailabilityRange(
                                            request.effective_from,
                                            request.effective_to,
                                            locale,
                                          )}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {getStatusLabel(request.status)}
                                        </span>
                                      </div>
                                      {reason && (
                                        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                                          {reason}
                                        </p>
                                      )}
                                      {reminderTrackingEnabled && (
                                        <p className="mt-1 text-[10px] text-muted-foreground">
                                          {t(
                                            "employee.messages.menu.reminders.limitUsage",
                                            {
                                              count: quota.count,
                                              limit: quota.limit,
                                            },
                                          )}
                                        </p>
                                      )}
                                      {quota.reached && (
                                        <p className="text-[10px] text-amber-600">
                                          {t(
                                            "employee.messages.menu.reminders.limitReached",
                                          )}
                                        </p>
                                      )}
                                    </button>
                                  );
                                })}
                              </>
                            )}
                            <button
                              type="button"
                              onClick={handleScheduleReminder}
                              disabled={!activePeer || scheduleReminderQuota.reached}
                              className="group w-full rounded-2xl border border-amber-200/80 bg-amber-50/40 px-3 py-3 text-left shadow-sm transition hover:border-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={t("employee.messages.menu.reminders.scheduleBadge")}
                            >
                              <div className="flex items-center justify-between text-[11px] font-semibold text-amber-900">
                                <span>{t("employee.messages.menu.reminders.scheduleBadge")}</span>
                                <span className="text-[10px] text-amber-800/80">
                                  {scheduleCardPayload.weekLabel}
                                </span>
                              </div>
                              <div className="pointer-events-none">
                                <ScheduleCardBlock
                                  payload={scheduleCardPayload}
                                  variant="preview"
                                />
                              </div>
                            </button>
                            <p className="text-[10px] text-muted-foreground">
                              {t("employee.messages.scheduleCard.previewHint")}
                            </p>
                            {reminderTrackingEnabled && (
                              <p className="text-[10px] text-muted-foreground">
                                {t("employee.messages.menu.reminders.limitUsage", {
                                  count: scheduleReminderQuota.count,
                                  limit: scheduleReminderQuota.limit,
                                })}
                              </p>
                            )}
                            {scheduleReminderQuota.reached && (
                              <p className="text-[10px] text-amber-600">
                                {t("employee.messages.menu.reminders.limitReached")}
                              </p>
                            )}
                          </div>
                        )}
                      </section>
                      <section>
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          <Share2 className="h-3.5 w-3.5" />
                          <span>{t("employee.messages.menu.forward.title")}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("employee.messages.menu.forward.helper")}
                        </p>
                        <div className="mt-2 space-y-2">
                          {timeOffRequests.length === 0 &&
                          availabilityRequests.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              {t("employee.messages.menu.forward.empty")}
                            </p>
                          ) : (
                            <>
                              {timeOffRequests.map((request) => (
                                <button
                                  key={`forward-to-${request.id}`}
                                  type="button"
                                  onClick={() => handleForwardTimeOff(request)}
                                  disabled={!activePeer}
                                  className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                                    <span>
                                      {t("employee.messages.menu.reminders.timeOffBadge")}
                                      {" "}· {formatTimeOffRange(
                                        request.start_ts,
                                        request.end_ts,
                                        locale,
                                      )}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {getStatusLabel(request.status)}
                                    </span>
                                  </div>
                                </button>
                              ))}
                              {availabilityRequests.map((request) => (
                                <button
                                  key={`forward-avail-${request.id}`}
                                  type="button"
                                  onClick={() => handleForwardAvailability(request)}
                                  disabled={!activePeer}
                                  className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                                    <span>
                                      {t(
                                        "employee.messages.menu.reminders.availabilityBadge",
                                      )}
                                      {" "}· {formatAvailabilityRange(
                                        request.effective_from,
                                        request.effective_to,
                                        locale,
                                      )}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {getStatusLabel(request.status)}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={handleForwardSchedule}
                            disabled={!activePeer || !activePeerIsEmployer}
                            className="w-full rounded-lg border border-sky-300/60 bg-sky-50/40 px-3 py-2 text-left font-semibold text-sky-800 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {t("employee.messages.menu.forward.schedule.title")}
                          </button>
                        </div>
                      </section>
                    </>
                  ) : (
                    <>
                      <section>
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          <Share2 className="h-3.5 w-3.5" />
                          <span>{t("employee.messages.menu.peerRequests.title")}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("employee.messages.menu.peerRequests.helper")}
                        </p>
                        <div className="mt-2 space-y-2">
                          {timeOffRequests.length === 0 &&
                          availabilityRequests.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              {t("employee.messages.menu.peerRequests.empty")}
                            </p>
                          ) : (
                            <>
                              {timeOffRequests.map((request) => (
                                <button
                                  key={`peer-request-to-${request.id}`}
                                  type="button"
                                  onClick={() => handlePeerTimeOffShare(request)}
                                  disabled={!activePeer}
                                  className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                                    <span>
                                      {t("employee.messages.menu.reminders.timeOffBadge")}
                                      {" "}· {formatTimeOffRange(
                                        request.start_ts,
                                        request.end_ts,
                                        locale,
                                      )}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {getStatusLabel(request.status)}
                                    </span>
                                  </div>
                                </button>
                              ))}
                              {availabilityRequests.map((request) => (
                                <button
                                  key={`peer-request-avail-${request.id}`}
                                  type="button"
                                  onClick={() => handlePeerAvailabilityShare(request)}
                                  disabled={!activePeer}
                                  className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                                    <span>
                                      {t(
                                        "employee.messages.menu.reminders.availabilityBadge",
                                      )}
                                      {" "}· {formatAvailabilityRange(
                                        request.effective_from,
                                        request.effective_to,
                                        locale,
                                      )}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {getStatusLabel(request.status)}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </section>
                      <section>
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>{t("employee.messages.menu.peerDrops.title")}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("employee.messages.menu.peerDrops.helper")}
                        </p>
                        <div className="mt-2 space-y-2">
                          <button
                            type="button"
                            onClick={handleDroppedShiftAsk}
                            disabled={!activePeer}
                            className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <p className="text-sm font-semibold">
                              {t("employee.messages.actions.requestShift")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t("employee.messages.menu.peerDrops.requestHelper")}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={handleDroppedShiftPickup}
                            disabled={!activePeer}
                            className="w-full rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <p className="text-sm font-semibold">
                              {t("employee.messages.actions.offerShift")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t("employee.messages.menu.peerDrops.pickupHelper")}
                            </p>
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </footer>
        </div>
      </main>

      {/* Right column */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-l bg-card/40 px-4 py-4">
        <div className="space-y-4">
          <div>
            {activeGroup ? (
              <>
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {t("employee.messages.groups.detailsTitle")}
                </h3>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {activeGroup.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("employee.messages.groups.detailsMembers", {
                    count: activeGroup.memberIds.length,
                  })}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {activeGroup.memberIds.slice(0, 6).map((memberId) => {
                    const profile = profileById.get(memberId);
                    const label =
                      memberId === currentUserId
                        ? t("employee.messages.youLabel")
                        : profileDisplayName(
                            profile,
                            t("employee.messages.groups.unknownMember"),
                          ) || t("employee.messages.groups.unknownMember");
                    const removeBusy =
                      preferenceBusyKey === `group:remove:${memberId}`;
                    return (
                      <li key={memberId} className="flex items-center justify-between gap-2">
                        <span>• {label}</span>
                        {activeGroupCreatedByCurrentUser && memberId !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => handleRemoveGroupMember(memberId, label)}
                            disabled={removeBusy}
                            className="text-[10px] font-semibold text-rose-600 hover:underline disabled:opacity-50"
                          >
                            {t("employee.messages.groups.actions.remove")}
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {Math.max(0, activeGroup.memberIds.length - 6) > 0 && (
                    <li>
                      {t("employee.messages.groupsBuilder.moreMembers", {
                        count: activeGroup.memberIds.length - 6,
                      })}
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {t("employee.messages.conversation.title")}
                </h3>
                <div className="mt-2 flex items-start gap-3">
                  <AvatarCircle
                    profile={activePeer ?? null}
                    sizeClass="h-12 w-12 shrink-0"
                    className="text-sm font-semibold"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-sm font-medium truncate">
                      {activePeerDisplayName ?? t("employee.messages.unknown")}
                    </div>
                    <div className="text-xs text-muted-foreground break-words">
                      {activePeer?.email ?? t("employee.messages.unknownEmail")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("employee.messages.conversation.role", {
                        role:
                          activePeerRole ??
                          t("employee.messages.conversation.roleFallback"),
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("employee.messages.conversation.location", {
                        location:
                          activePeerLocation ??
                          t("employee.messages.conversation.locationFallback"),
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {activePeerSummary ?? t("employee.messages.conversation.bio")}
                    </p>
                  </div>
                  <div ref={peerPreferenceMenuRef} className="relative ml-auto shrink-0">
                    <button
                      type="button"
                      aria-label={t("employee.messages.preferences.title")}
                      onClick={() =>
                        setPreferenceMenuOpen((prev) =>
                          prev === "peer" ? null : "peer",
                        )
                      }
                      className="rounded-full border border-border/60 p-2 text-muted-foreground transition hover:bg-muted"
                    >
                      <Cog className="h-4 w-4" />
                    </button>
                    {peerMenuOpen && (
                      <div className="absolute right-0 top-10 z-30 w-60 rounded-md border border-border/60 bg-card p-2 text-xs shadow-lg">
                        <button
                          type="button"
                          onClick={handleTogglePeerMute}
                          disabled={peerMuteBusy}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-semibold transition hover:bg-muted/60 disabled:opacity-60"
                        >
                          <span>
                            {activePeerMuted
                              ? t("employee.messages.preferences.unsilenceButton")
                              : t("employee.messages.preferences.silenceButton")}
                          </span>
                          {peerMuteBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleTogglePeerBlock}
                          disabled={peerBlockBusy}
                          className="mt-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          <span>
                            {activePeerBlockedByMe
                              ? t("employee.messages.preferences.unblockButton")
                              : t("employee.messages.preferences.blockButton")}
                          </span>
                          {peerBlockBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                        </button>
                        {activePeerBlocked && (
                          <p className="mt-2 text-[11px] text-amber-600">
                            {activePeerBlockedByMe
                              ? t("employee.messages.preferences.blockedByYouNotice", {
                                  name: resolvedPeerName,
                                })
                              : t("employee.messages.preferences.blockedYouNotice", {
                                  name: resolvedPeerName,
                                })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          {preferenceError && (
            <p className="mt-2 text-[11px] text-rose-600">
              {preferenceError}
            </p>
          )}

          {activeGroup ? (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground">
                {t("employee.messages.groups.actions.title")}
              </h4>
              <div className="mt-2 space-y-2 text-xs">
                <button
                  type="button"
                  onClick={handleLeaveGroup}
                  disabled={groupLeaveBusy}
                  className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-left font-semibold transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                >
                  {t("employee.messages.groups.actions.leave")}
                </button>
                {activeGroupCreatedByCurrentUser && (
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    disabled={groupDeleteBusy}
                    className="w-full rounded-md border border-rose-300/80 bg-rose-50/40 px-3 py-2 text-left font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-60"
                  >
                    {t("employee.messages.groups.actions.delete")}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground">
              {t("employee.messages.filters.title")}
            </h4>
            <div className="mt-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("employee.messages.filters.searchPlaceholder")}
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
                  {t("employee.messages.filters.all")}
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
                  {t("employee.messages.filters.today")}
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
                  {t("employee.messages.filters.sevenDays")}
                </button>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground">
              {t("employee.messages.schedule.title")}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {t("employee.messages.schedule.subtitle")}
            </p>
            <div className="mt-3">
              {isLoadingSchedule ? (
                <div className="text-xs text-muted-foreground">
                  {t("employee.messages.schedule.loading")}
                </div>
              ) : (
                <ul className="space-y-2">
                  {weekSchedule.length === 0 ? (
                    <li className="text-xs text-muted-foreground">
                      {t("employee.messages.schedule.empty")}
                    </li>
                  ) : (
                    weekSchedule.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between"
                      >
                        <div className="text-sm font-medium">{s.day}</div>
                        <div className="text-sm text-muted-foreground">
                          {s.time} · {s.title}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>

    {scheduleModalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="relative flex h-[80vh] w-full max-w-5xl flex-col rounded-2xl bg-card p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t("employee.messages.scheduleCard.modal.title", {
                    name: scheduleModalState.employeeName,
                  })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("employee.messages.scheduleCard.modal.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeScheduleModal}
                aria-label={t("shared.buttons.close")}
                className="rounded-full border border-border/70 p-2 text-muted-foreground transition hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-4 overflow-hidden md:flex-row">
              <div className="max-h-full w-full overflow-y-auto rounded-xl border border-border/70 bg-background p-4 md:w-[320px]">
                <ScheduleCardBlock
                  payload={scheduleModalState.payload}
                  variant="preview"
                />
                <a
                  href={SCHEDULE_FORWARD_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-primary/40 px-3 py-2 text-[12px] font-semibold text-primary hover:bg-primary/10"
                >
                  {t("employee.messages.scheduleCard.modal.externalLink")}
                </a>
              </div>
              <div className="hidden flex-1 overflow-hidden rounded-xl border border-border/70 bg-white dark:bg-slate-950 md:flex">
                <iframe
                  src={SCHEDULE_FORWARD_LINK}
                  title="Schedule builder"
                  className="h-full w-full border-0"
                />
              </div>
              <div className="rounded-xl border border-dashed border-border/60 p-3 text-[12px] text-muted-foreground md:hidden">
                {t("employee.messages.scheduleCard.modal.mobileHint")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function getTempMessageId(): UUID | null {
  return getNativeUuid();
}

function generateUuid(): UUID {
  const native = getNativeUuid();
  if (native) {
    return native;
  }

  const fallback = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    },
  );

  return fallback as UUID;
}

function getNativeUuid(): UUID | null {
  const cryptoObj = resolveCrypto();
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID() as UUID;
  }
  return null;
}

type CryptoLike = {
  randomUUID?: () => string;
};

function resolveCrypto(): CryptoLike | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }
  return (globalThis as { crypto?: CryptoLike }).crypto;
}


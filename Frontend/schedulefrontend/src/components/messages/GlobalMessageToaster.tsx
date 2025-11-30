"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { MessageCircle, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { parseScheduleCard, parseForwardCard, SCHEDULE_CARD_PREFIX, FORWARD_CARD_PREFIX } from "@/lib/messagingCards";

type UUID = string;

type MessageRow = {
  id: UUID;
  sender_id: UUID;
  recipient_id: UUID;
  content: string;
  created_at: string;
};

type GroupMessageRow = {
  id: UUID;
  group_id: UUID;
  sender_id: UUID;
  content: string;
  created_at: string;
};

type ProfileSummary = {
  id: UUID;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
};

type GroupMeta = {
  id: UUID;
  name: string;
};

type ToastEntry = {
  id: string;
  senderName: string;
  preview: string;
  context?: string;
};

const AUTO_DISMISS_MS = 6000;
const PREVIEW_CHAR_LIMIT = 140;

function profileDisplayName(profile: ProfileSummary | null, fallback: string) {
  if (!profile) return fallback;
  const display = profile.display_name?.trim();
  if (display) return display;
  const full = profile.full_name?.trim();
  if (full) return full;
  const email = profile.email?.trim();
  if (email) return email;
  return fallback;
}

function trimPreview(text: string) {
  if (text.length <= PREVIEW_CHAR_LIMIT) return text;
  return `${text.slice(0, PREVIEW_CHAR_LIMIT - 1)}…`;
}

function summarizeContent(content: string, fallback: string, t: ReturnType<typeof useI18n>["t"]) {
  if (!content) return fallback;
  if (content.startsWith(SCHEDULE_CARD_PREFIX)) {
    const parsed = parseScheduleCard(content);
    if (parsed) {
      return t("shared.messages.toastScheduleCard", { week: parsed.weekLabel });
    }
  }
  if (content.startsWith(FORWARD_CARD_PREFIX)) {
    const parsed = parseForwardCard(content);
    if (parsed) {
      return t("shared.messages.toastForwardCard", {
        type: parsed.requestType === "timeOff" ? t("shared.messages.toastForwardTimeOff") : t("shared.messages.toastForwardAvailability"),
      });
    }
  }
  return trimPreview(content.trim() || fallback);
}

export function GlobalMessageToaster() {
  const supabase = createClientComponentClient();
  const { t } = useI18n();
  const [currentUserId, setCurrentUserId] = useState<UUID | null>(null);
  const [groupMeta, setGroupMeta] = useState<GroupMeta[]>([]);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const profileCacheRef = useRef<Record<string, ProfileSummary | null>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const enqueueToast = useCallback(
    ({ senderName, preview, context }: Omit<ToastEntry, "id">) => {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, senderName, preview, context }]);
      timersRef.current[id] = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast],
  );

  const resolveProfile = useCallback(
    async (userId: UUID): Promise<ProfileSummary | null> => {
      if (profileCacheRef.current[userId]) {
        return profileCacheRef.current[userId];
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,full_name,email")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Global toast: failed to load profile", error);
        profileCacheRef.current[userId] = null;
        return null;
      }
      profileCacheRef.current[userId] = data as ProfileSummary | null;
      return profileCacheRef.current[userId];
    },
    [supabase],
  );

  const handleIncomingDirect = useCallback(
    async (message: MessageRow) => {
      if (!currentUserId || message.sender_id === currentUserId) return;
      const profile = await resolveProfile(message.sender_id);
      const senderName = profileDisplayName(profile, t("shared.messages.unnamed"));
      const preview = summarizeContent(
        message.content,
        t("shared.messages.toastEmptyMessage"),
        t,
      );
      enqueueToast({ senderName, preview });
    },
    [currentUserId, resolveProfile, enqueueToast, t],
  );

  const handleIncomingGroup = useCallback(
    async (message: GroupMessageRow, groupName: string) => {
      if (!currentUserId || message.sender_id === currentUserId) return;
      const profile = await resolveProfile(message.sender_id);
      const senderName = profileDisplayName(profile, t("shared.messages.unnamed"));
      const preview = summarizeContent(
        message.content,
        t("shared.messages.toastEmptyMessage"),
        t,
      );
      enqueueToast({ senderName, preview, context: groupName });
    },
    [currentUserId, resolveProfile, enqueueToast, t],
  );

  useEffect(() => {
    let active = true;
    async function loadUser() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (!active) return;
      if (error) {
        console.error("Global toast: failed to fetch user", error);
      }
      setCurrentUserId(user?.id ?? null);
    }
    loadUser();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshGroupMeta = useCallback(async () => {
    if (!currentUserId) {
      setGroupMeta([]);
      return;
    }
    const { data, error } = await supabase
      .from("group_thread_member")
      .select("group_id, group:group_thread(id, name)")
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Global toast: failed to load group memberships", error);
      setGroupMeta([]);
      return;
    }
    const dedup = new Map<UUID, string>();
    (data ?? []).forEach((row) => {
      const group = Array.isArray(row.group) ? row.group[0] : row.group;
      const id = (row.group_id ?? group?.id) as UUID | undefined;
      if (!id) return;
      const name = group?.name ?? t("employee.messages.groupsHeading");
      dedup.set(id, name);
    });
    const next: GroupMeta[] = Array.from(dedup.entries()).map(([id, name]) => ({
      id,
      name,
    }));
    setGroupMeta(next);
  }, [supabase, currentUserId, t]);

  useEffect(() => {
    refreshGroupMeta();
  }, [refreshGroupMeta]);

  useEffect(() => {
    if (!currentUserId) return;
    const membershipChannel = supabase
      .channel(`global-group-membership:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_thread_member",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          refreshGroupMeta();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membershipChannel);
    };
  }, [supabase, currentUserId, refreshGroupMeta]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`global-dm-toasts:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          handleIncomingDirect(payload.new as MessageRow);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, handleIncomingDirect]);

  useEffect(() => {
    if (!currentUserId || groupMeta.length === 0) return;
    const channels: RealtimeChannel[] = groupMeta.map((group) =>
      supabase
        .channel(`global-group-toasts:${group.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_message",
            filter: `group_id=eq.${group.id}`,
          },
          (payload) => {
            handleIncomingGroup(payload.new as GroupMessageRow, group.name);
          },
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [supabase, currentUserId, groupMeta, handleIncomingGroup]);

  useEffect(() => {
    return () => {
      Object.keys(timersRef.current).forEach((id) => {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      });
    };
  }, []);

  useEffect(() => {
    if (currentUserId) return;
    setToasts([]);
    Object.keys(timersRef.current).forEach((id) => {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    });
  }, [currentUserId]);

  if (!currentUserId || toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex max-w-xs flex-col gap-2 sm:max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-xl border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur"
        >
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <span>{toast.senderName}</span>
                </div>
                <p className="text-sm text-primary/90">{toast.preview}</p>
              </div>
              {toast.context && (
                <p className="text-[11px] text-muted-foreground">
                  {t("shared.messages.toastGroupPrefix", { name: toast.context })}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={t("shared.buttons.close")}
              className="rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => dismissToast(toast.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

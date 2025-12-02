"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  incrementUnreadCount,
  saveUnreadCounts,
  saveUnreadFlag,
  type UnreadScope,
} from "../lib/unreadTracker";

export function useUnreadRealtimeBridge(
  scope: UnreadScope,
  supabase: SupabaseClient,
) {
  const [userId, setUserId] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);

  // Keep user id in sync so we know who to watch for inserts.
  useEffect(() => {
    let isMounted = true;

    const resolveUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!isMounted) return;
        setUserId(data.user?.id ?? null);
      } catch {
        if (isMounted) {
          setUserId(null);
        }
      }
    };

    void resolveUser();

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setUserId(session?.user?.id ?? null);
      },
    );

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [supabase]);

  // Watch incoming direct messages.
  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`unread-dm:${scope}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { sender_id?: string | null };
          const senderId = row?.sender_id ?? null;
          if (!senderId || senderId === userId) return;
          saveUnreadFlag(scope, true);
          incrementUnreadCount(scope, "dm", senderId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scope, supabase, userId]);

  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;

    const bootstrapUnread = async () => {
      try {
        const { data, error } = await supabase
          .from("message")
          .select("sender_id")
          .eq("recipient_id", userId)
          .is("read_at", null);

        if (cancelled) return;

        if (error) {
          console.error("Unable to bootstrap unread status", error);
          return;
        }

        const counts: Record<string, number> = {};
        (data ?? []).forEach((row) => {
          const senderId = (row as { sender_id?: string | null }).sender_id;
          if (!senderId) return;
          counts[senderId] = (counts[senderId] ?? 0) + 1;
        });

        saveUnreadCounts(scope, "dm", counts);

        if (Object.keys(counts).length > 0) {
          saveUnreadFlag(scope, true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error bootstrapping unread status", err);
        }
      }
    };

    void bootstrapUnread();

    return () => {
      cancelled = true;
    };
  }, [scope, supabase, userId]);

  // Load group ids for the current user.
  useEffect(() => {
    if (!userId) {
      setGroupIds([]);
      return;
    }

    let cancelled = false;

    const loadGroupIds = async () => {
      try {
        const { data, error } = await supabase
          .from("group_thread_member")
          .select("group_id")
          .eq("user_id", userId);

        if (cancelled) return;

        if (error) {
          console.error("Unable to load group memberships for unread watcher", error);
          setGroupIds([]);
          return;
        }

        const ids = (data ?? [])
          .map((row) => row.group_id)
          .filter((id): id is string => Boolean(id));
        setGroupIds(ids);
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading group memberships for unread watcher", err);
          setGroupIds([]);
        }
      }
    };

    void loadGroupIds();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  // Subscribe to new group messages for each membership.
  useEffect(() => {
    if (!userId || groupIds.length === 0) return undefined;

    const channels = groupIds.map((groupId) =>
      supabase
        .channel(`unread-group:${scope}:${groupId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_message",
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const row = payload.new as {
              sender_id?: string | null;
              group_id?: string | null;
            };
            if (!row?.group_id || row.sender_id === userId) return;
            saveUnreadFlag(scope, true);
            incrementUnreadCount(scope, "group", row.group_id);
          },
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [groupIds, scope, supabase, userId]);
}

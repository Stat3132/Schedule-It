// app/messaging/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/auth-helpers-nextjs";
import { Loader2, MessageCircle, Send, Users } from "lucide-react";

type UUID = string;

type Profile = {
  id: UUID;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
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

export default function MessagingPage() {
  const supabase = createClientComponentClient();
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<UUID | null>(null);

  const [contacts, setContacts] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [activePeer, setActivePeer] = useState<Profile | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false);

  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const messageEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

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

  // Load contacts (coworkers) from profiles
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;
    async function loadContacts(client: SupabaseClient) {
      setIsLoadingContacts(true);

      // Simple approach: get coworkers via profiles; RLS will scope to coworkers.
      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, email, photo_url")
        .order("full_name", { ascending: true })
        .limit(100);

      if (cancelled) return;

      if (error) {
        console.error("Error loading contacts:", error);
        setContacts([]);
        setConversations([]);
        setIsLoadingContacts(false);
        return;
      }

      const filtered = (data ?? []).filter((p) => p.id !== currentUserId);
      setContacts(filtered);

      // For now, "conversations" are just contacts with placeholder lastMessage.
      const convs: DMConversation[] = filtered.map((peer) => ({
        peer,
        lastMessage: null,
      }));

      setConversations(convs);
      setIsLoadingContacts(false);

      // Preselect first contact if none active
      if (!activePeer && filtered.length > 0) {
        setActivePeer(filtered[0]);
      }
    }

    loadContacts(supabase);

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId]);

  // Load messages for active peer
  useEffect(() => {
    if (!currentUserId || !activePeer) return;

    let cancelled = false;

    async function loadMessages() {
      setIsLoadingMessages(true);

      // Build a safe PostgREST filter string for the two-way DM query.
      // Wrap UUIDs in single quotes to ensure PostgREST interprets them as strings.
      const a = String(currentUserId!);
      const b = String(activePeer!.id);
      const filter = `and(sender_id.eq.'${a}',recipient_id.eq.'${b}'),and(sender_id.eq.'${b}',recipient_id.eq.'${a}')`;
      console.log("[messages] loading with filter:", filter);

      const { data, error } = await supabase
        .from("message")
        .select("*")
        .or(filter)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;

      if (error) {
        console.error("Error loading messages:", error);
        setMessages([]);
      } else {
        setMessages((data as MessageRow[]) ?? []);
      }

      setInitialMessagesLoaded(true);
      setIsLoadingMessages(false);
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, activePeer?.id]);

  // Realtime subscription for new messages in this DM
  useEffect(() => {
    if (!currentUserId || !activePeer) return;

    const channel = supabase
      .channel(`dm:${currentUserId}:${activePeer.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message",
          // We only care about messages sent by the peer (to us) in realtime.
          filter: `sender_id=eq.${activePeer.id}`,
        },
        (payload) => {
          const newRow = payload.new as MessageRow;

          // Ensure this is actually for this conversation
          if (newRow.recipient_id !== currentUserId) return;

          setMessages((prev) => {
            // If we already have it, don't duplicate
            if (prev.some((m) => m.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUserId, activePeer?.id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !activePeer) return;
    if (!newMessage.trim()) return;

    const content = newMessage.trim();
    setSending(true);

    // Optimistic UI: add message locally
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: MessageRow = {
      id: tempId,
      sender_id: currentUserId,
      recipient_id: activePeer.id,
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");

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
      console.error("Error sending message:", error);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Optionally show toast/snackbar here.
    } else if (data) {
      // Replace optimistic with real row
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (data as MessageRow) : m))
      );
    }

    setSending(false);
  }

  const headerTitle = useMemo(() => {
    if (!activePeer) return "Messages";
    return activePeer.full_name || activePeer.email || "Conversation";
  }, [activePeer]);

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
    <div className="flex h-[calc(100vh-4rem)] min-h-[600px] w-full bg-background">
      {/* Left sidebar: contacts + (future) groups */}
      <aside className="flex w-72 flex-col border-r bg-card/60 backdrop-blur-sm">
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
          {/* Direct Messages section */}
          <div className="px-3 pt-3">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Direct messages
              </span>
              {isLoadingContacts && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>

            {conversations.length === 0 && !isLoadingContacts && (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                No coworkers found yet. Once you&apos;re added to a business,
                they&apos;ll show up here.
              </p>
            )}

            <ul className="space-y-1 pb-3">
              {conversations.map((conv) => {
                const isActive = activePeer?.id === conv.peer.id;
                const initials =
                  conv.peer.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() ||
                  conv.peer.email?.[0]?.toUpperCase() ||
                  "?";

                return (
                  <li key={conv.peer.id}>
                    <button
                      type="button"
                      onClick={() => setActivePeer(conv.peer)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary-foreground/90"
                          : "hover:bg-muted",
                      ].join(" ")}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                        {initials}
                      </div>
                      <div className="flex-1">
                        <p className="truncate text-xs font-medium">
                          {conv.peer.full_name || conv.peer.email}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {conv.lastMessage?.content || "Start a conversation"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Groups (future) */}
          <div className="border-t px-3 pb-3 pt-2">
            <div className="mb-1 flex items-center gap-2 px-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Groups
              </span>
            </div>
            <p className="px-1 text-[11px] text-muted-foreground">
              Group chats coming soon. You&apos;ll be able to create channels
              for roles, locations, and teams.
            </p>
          </div>
        </div>
      </aside>

      {/* Main chat panel */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{headerTitle}</h2>
            {activePeer && (
              <p className="truncate text-xs text-muted-foreground">
                Direct message · {activePeer.email}
              </p>
            )}
          </div>
          {/* Placeholder for status / filters */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Online</span>
          </div>
        </header>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto bg-muted/40 px-4 py-3">
          {!activePeer && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground" />
              <p>Select a coworker on the left to start chatting.</p>
            </div>
          )}

          {activePeer && (
            <div className="flex h-full flex-col gap-2">
              {!initialMessagesLoaded && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading messages…</span>
                </div>
              )}

              {initialMessagesLoaded && messages.length === 0 && (
                <div className="mt-4 text-xs text-muted-foreground">
                  No messages yet. Say hi to start the conversation.
                </div>
              )}

              {messages.map((msg) => {
                const isMine = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={[
                      "flex w-full",
                      isMine ? "justify-end" : "justify-start",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "max-w-[70%] rounded-2xl px-3 py-2 text-xs shadow-sm",
                        isMine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-card",
                      ].join(" ")}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                      <div className="mt-1 text-[10px] text-muted-foreground/80">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <footer className="border-t bg-background/80 px-4 py-3">
          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm"
          >
            <textarea
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-xs placeholder:text-muted-foreground"
              placeholder={
                activePeer
                  ? `Message ${activePeer.full_name || activePeer.email}…`
                  : "Select a coworker to start messaging…"
              }
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={!activePeer || sending}
            />
            <button
              type="submit"
              disabled={!activePeer || sending || !newMessage.trim()}
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
    </div>
  );
}

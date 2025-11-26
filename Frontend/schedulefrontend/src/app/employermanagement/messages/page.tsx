// app/employermanagement/messages/page.tsx

"use client";

import type React from "react";
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

function dmChannelName(a: UUID, b: UUID) {
  return ["dm", ...[a, b].sort()].join(":");
}

export default function EmployerMessagingPage() {
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
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days">("all");
  const [weekSchedule, setWeekSchedule] = useState<
    Array<{ day: string; time: string; title: string }>
  >([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  const [isPeerTyping, setIsPeerTyping] = useState(false);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Load contacts
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;
    async function loadContacts(client: SupabaseClient) {
      setIsLoadingContacts(true);

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

      const convs: DMConversation[] = filtered.map((peer) => ({
        peer,
        lastMessage: null,
      }));

      setConversations(convs);
      setIsLoadingContacts(false);

      if (!activePeer && filtered.length > 0) {
        setActivePeer(filtered[0]);
      }
    }

    loadContacts(supabase);

    return () => {
      cancelled = true;
    };
  }, [supabase, currentUserId, activePeer]);

  // Load schedule
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    async function loadSchedule() {
      setIsLoadingSchedule(true);
      try {
        const startOfWeek = new Date();
        startOfWeek.setHours(0, 0, 0, 0);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const { data: shifts, error } = await supabase
          .from("shifts")
          .select("id,start_time,end_time,role,location")
          .gte("start_time", startOfWeek.toISOString())
          .lte("start_time", endOfWeek.toISOString())
          .eq("user_id", currentUserId)
          .order("start_time", { ascending: true })
          .limit(20);

        if (!cancelled && !error && Array.isArray(shifts)) {
          const mapped = shifts.map((s: Record<string, unknown>) => {
            const start = s.start_time as string;
            const d = new Date(start);
            const dayLabel = d.toLocaleDateString(undefined, {
              weekday: "short",
            });
            const timeLabel = d.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const title =
              (s.role as string | undefined) ??
              (s.location as string | undefined) ??
              "Shift";
            return { day: dayLabel, time: timeLabel, title };
          });
          setWeekSchedule(mapped);
          setIsLoadingSchedule(false);
          return;
        }
      } catch {
        // ignore and fall back to mock
      }

      if (!cancelled) {
        setWeekSchedule([
          { day: "Mon", time: "9:00 AM–5:00 PM", title: "Front Desk" },
          { day: "Wed", time: "11:00 AM–7:00 PM", title: "Sales" },
          { day: "Fri", time: "8:00 AM–4:00 PM", title: "Stock" },
        ]);
        setIsLoadingSchedule(false);
      }
    }

    loadSchedule();
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

      const a = currentUserId!;
      const b = activePeer!.id;

      const { data, error } = await supabase
        .from("message")
        .select("*")
        .in("sender_id", [a, b])
        .in("recipient_id", [a, b])
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

  // Realtime messages + typing indicator
  useEffect(() => {
    if (!currentUserId || !activePeer) return;

    const channelName = dmChannelName(currentUserId, activePeer.id);
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
          const ids = [newRow.sender_id, newRow.recipient_id];
          if (!ids.includes(currentUserId) || !ids.includes(activePeer.id)) {
            return;
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === newRow.id)) return prev;
            return [...prev, newRow];
          });
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { senderId } = payload as { senderId: UUID };
        if (senderId === currentUserId) return;

        setIsPeerTyping(true);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(
          () => setIsPeerTyping(false),
          3000
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
  }, [supabase, currentUserId, activePeer?.id]);

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !activePeer) return;
    if (!newMessage.trim()) return;

    const content = newMessage.trim();
    setSending(true);

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

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      // eslint-disable-next-line no-console
      console.log(
        "Sending message: currentUserId=",
        currentUserId,
        "sessionUserId=",
        sessionData?.session?.user?.id
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to read session before send", err);
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
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (data as MessageRow) : m))
      );
    }

    setSending(false);
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
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{headerTitle}</h2>
            {activePeer && (
              <p className="truncate text-xs text-muted-foreground">
                Direct message · {activePeer.email}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Online</span>
          </div>
        </header>

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

              {initialMessagesLoaded && displayedMessages.length === 0 && (
                <div className="mt-4 text-xs text-muted-foreground">
                  No messages yet. Say hi to start the conversation.
                </div>
              )}

              {displayedMessages.map((msg) => {
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

              {isPeerTyping && activePeer && (
                <div className="flex w-full justify-start">
                  <div className="max-w-[40%] rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-xs shadow-sm">
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
                  ? `Message ${activePeer.full_name || activePeer.email}…`
                  : "Select a coworker to start messaging…"
              }
              value={newMessage}
              onChange={handleTextareaChange}
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

      {/* Right column */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-l bg-card/40 px-4 py-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground">
              Conversation
            </h3>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-muted-foreground/10 flex items-center justify-center text-sm font-semibold text-muted-foreground">
                {activePeer?.full_name?.[0] ??
                  activePeer?.email?.[0] ??
                  "?"}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {activePeer?.full_name ?? "Unknown"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activePeer?.email ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Role: {activePeer ? "Employee" : "—"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Short bio or notes about this coworker can go here.
            </p>
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
              This Week
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Your upcoming shifts this week.
            </p>
            <div className="mt-3">
              {isLoadingSchedule ? (
                <div className="text-xs text-muted-foreground">
                  Loading schedule…
                </div>
              ) : (
                <ul className="space-y-2">
                  {weekSchedule.length === 0 ? (
                    <li className="text-xs text-muted-foreground">
                      No shifts scheduled this week.
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
  );
}

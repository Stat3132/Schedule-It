"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Megaphone,
  Calendar,
  User as UserIcon,
  Trash2,
} from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import type { Announcement } from "../../../lib/supabase";
import {
  normalizeAnnouncementRow,
  markAnnouncementsAsRead,
  type AnnouncementRow,
} from "../../../lib/announcements";

type Employment = {
  role_id: string | null;
  status: "invited" | "active" | "inactive" | "terminated";
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
};

type AnnouncementWithSender = Announcement & {
  senderName: string;
  isNew: boolean;
};

export default function EmployeeAnnouncementsPage() {
  const supabase = createClientComponentClient();
  const { t, locale } = useI18n();

  const [announcements, setAnnouncements] =
    useState<AnnouncementWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [locale],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      try {
        // 1) Auth
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        if (!cancelled) {
          setCurrentUserId(user?.id ?? null);
        }
        if (!user) {
          if (!cancelled) {
            setAnnouncements([]);
          }
          return;
        }

        // 2) Get employee's active role
        const { data: emp, error: empErr } = await supabase
          .from("employment")
          .select("role_id,status")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (empErr) {
          console.error("[EmployeeAnnouncements] employment error", empErr);
        }

        const employment = emp as Employment | null;
        const roleId = employment?.role_id ?? null;

        // 3) Load all announcements
        const { data: annRows, error: annErr } = await supabase
          .from("announcements")
          .select("id,title,content,created_at,created_by,target_role_ids")
          .order("created_at", { ascending: false });

        if (annErr) {
          console.error("[EmployeeAnnouncements] announcements error", annErr);
          if (!cancelled) {
            setAnnouncements([]);
          }
          return;
        }

        const rawAnnouncements = (annRows ?? []) as AnnouncementRow[];
        const normalized = rawAnnouncements.map(normalizeAnnouncementRow);

        // 4) Filter to announcements that apply to this role
        const applicable = normalized.filter((a) => {
          if (a.target_role_ids.length === 0) return true; // broadcast
          if (!roleId) return false;
          return a.target_role_ids.includes(roleId);
        });

        if (applicable.length === 0) {
          if (!cancelled) {
            setAnnouncements([]);
          }
          return;
        }

        const applicableIds = applicable.map((a) => a.id);
        let previouslyReadIds = new Set<string>();
        if (applicableIds.length) {
          const { data: receipts, error: receiptErr } = await supabase
            .from("announcement_receipt")
            .select("announcement_id")
            .eq("user_id", user.id)
            .in("announcement_id", applicableIds);

          if (receiptErr) {
            console.error(
              "[EmployeeAnnouncements] receipts error",
              receiptErr,
            );
          } else {
            previouslyReadIds = new Set(
              (receipts ?? []).map((r) => r.announcement_id as string),
            );
          }
        }

        const unreadIds = new Set(
          applicable
            .filter((a) => !previouslyReadIds.has(a.id))
            .map((a) => a.id),
        );

        if (unreadIds.size) {
          await markAnnouncementsAsRead(
            supabase,
            user.id,
            Array.from(unreadIds),
          );
        }

        // 5) Load sender names for all creators
        const senderIds = Array.from(
          new Set(applicable.map((a) => a.created_by).filter(Boolean)),
        );

        let senderMap: Record<string, string> = {};
        if (senderIds.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id,full_name,display_name,email")
            .in("id", senderIds);

          if (profErr) {
            console.error("[EmployeeAnnouncements] profiles error", profErr);
          }

          const profileRows = (profs ?? []) as ProfileRow[];
          senderMap = profileRows.reduce<Record<string, string>>((acc, p) => {
            const name = p.full_name || p.display_name || p.email || "";
            acc[p.id] = name;
            return acc;
          }, {});
        }

        const withSender: AnnouncementWithSender[] = applicable.map((a) => ({
          ...a,
          senderName: senderMap[a.created_by] ?? "",
          isNew: unreadIds.has(a.id),
        }));

        if (!cancelled) {
          setAnnouncements(withSender);
        }
      } catch (loadErr) {
        console.error("[EmployeeAnnouncements] load error", loadErr);
        if (!cancelled) {
          setAnnouncements([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const formatDateTime = (iso: string) => dateFormatter.format(new Date(iso));

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("employee.announcements.actions.deleteConfirm"))) {
      return;
    }
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("[EmployeeAnnouncements] delete error", error);
        return;
      }
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3">
              <Megaphone className="text-primary" size={28} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
                {t("employee.announcements.cardLabel")}
              </p>
              <h1 className="text-3xl font-bold text-foreground">
                {t("employee.announcements.title")}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t("employee.announcements.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-muted-foreground mt-4">
              {t("employee.announcements.loading")}
            </p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
            <Megaphone className="mx-auto text-muted mb-4" size={48} />
            <h3 className="text-lg font-semibold text-card-foreground mb-2">
              {t("employee.announcements.emptyTitle")}
            </h3>
            <p className="text-muted-foreground">
              {t("employee.announcements.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {announcements.map((a) => {
              const audienceLabel =
                a.target_role_ids.length === 0
                  ? t("employee.announcements.audienceAll")
                  : t("employee.announcements.audienceTargeted", {
                      count: a.target_role_ids.length,
                    });
              const canDelete = currentUserId === a.created_by;
              const deleting = deletingId === a.id;
              return (
                <article
                  key={a.id}
                  className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                          {t("employee.announcements.cardLabel")}
                        </p>
                        {a.isNew && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {t("employee.home.announcement.newLabel")}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-semibold text-card-foreground">
                        {a.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("employee.announcements.from", {
                          name:
                            a.senderName || t("shared.messages.managerFallback"),
                        })}
                      </p>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={deleting}
                        className="rounded-full border border-border/70 p-2 text-muted-foreground transition hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                        aria-label={t("employee.announcements.actions.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-foreground">
                    {a.content}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateTime(a.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-3 py-1">
                      <UserIcon className="h-3 w-3" />
                      {audienceLabel}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

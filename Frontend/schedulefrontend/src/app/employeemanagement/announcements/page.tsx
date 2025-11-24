"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Megaphone, Calendar, User as UserIcon } from "lucide-react";

type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  target_role_ids?: string[] | null;
};

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

type AnnouncementWithSender = AnnouncementRow & {
  senderName: string;
};

export default function EmployeeAnnouncementsPage() {
  const supabase = createClientComponentClient();

  const [announcements, setAnnouncements] =
    useState<AnnouncementWithSender[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1) Auth
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        if (!cancelled) {
          setAnnouncements([]);
          setLoading(false);
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
          setLoading(false);
        }
        return;
      }

      const rawAnnouncements = (annRows ?? []) as AnnouncementRow[];

      // 4) Filter to announcements that apply to this role
      const applicable = rawAnnouncements.filter((a) => {
        const targets = a.target_role_ids;
        if (!targets || targets.length === 0) return true; // broadcast
        if (!roleId) return false;
        return targets.includes(roleId);
      });

      if (applicable.length === 0) {
        if (!cancelled) {
          setAnnouncements([]);
          setLoading(false);
        }
        return;
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
          const name = p.full_name || p.display_name || p.email || "Manager";
          acc[p.id] = name;
          return acc;
        }, {});
      }

      const withSender: AnnouncementWithSender[] = applicable.map((a) => ({
        ...a,
        senderName: senderMap[a.created_by] ?? "Manager",
      }));

      if (!cancelled) {
        setAnnouncements(withSender);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary rounded-lg">
              <Megaphone className="text-primary-foreground" size={28} />
            </div>
            <h1 className="text-3xl font-bold text-foreground">
              Your Announcements
            </h1>
          </div>
          <p className="text-muted-foreground ml-14">
            View important updates that have been sent to you
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-muted-foreground mt-4">
              Loading announcements...
            </p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-card rounded-xl shadow-sm border border-border p-12 text-center">
            <Megaphone className="mx-auto text-muted mb-4" size={48} />
            <h3 className="text-lg font-semibold text-card-foreground mb-2">
              No announcements for you yet
            </h3>
            <p className="text-muted-foreground">
              When your manager sends an announcement to your role, it will
              appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="bg-card rounded-xl shadow-sm border border-border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start gap-4 mb-3">
                  <h3 className="text-lg font-semibold text-card-foreground flex-1">
                    {a.title}
                  </h3>
                </div>

                <p className="text-muted-foreground mb-4 whitespace-pre-wrap leading-relaxed">
                  {a.content}
                </p>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <UserIcon size={14} />
                    <span>From {a.senderName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={14} />
                    <span>{formatDateTime(a.created_at)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

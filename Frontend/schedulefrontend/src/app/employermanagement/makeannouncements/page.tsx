"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Announcement } from "../../../lib/supabase";
import { AnnouncementForm } from "../../../components/ui/AnnouncementForm";
import { AnnouncementCard } from "../../../components/ui/AnnouncementCard";

type RoleRow = { id: string; name: string };

export default function AnnouncementsPage() {
  const supabase = createClientComponentClient();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = async (businessRoleIds: string[] | null = null) => {
    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Announcement[];

      // If we know the role ids for this business, filter announcements to
      // those that are broadcast (null/empty) or target one of these roles.
      if (businessRoleIds && businessRoleIds.length > 0) {
        const filtered = rows.filter((a) => {
          const targets = a.target_role_ids as string[] | null | undefined;
          if (!targets || targets.length === 0) return true; // broadcast
          return targets.some((t) => businessRoleIds.includes(t));
        });
        setAnnouncements(filtered);
      } else {
        // No business context -> show everything
        setAnnouncements(rows);
      }
    } catch (error) {
      console.error("Error fetching announcements:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableRoles = async (businessIdParam?: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Find the manager's active employment to get business_id
      let businessId = businessIdParam;
      if (!businessId) {
        const { data: emps, error: empErr } = await supabase
          .from("employment")
          .select("business_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1);

        if (empErr || !emps || emps.length === 0) return;

        businessId = emps[0].business_id as string;
      }

      const { data: roleRows, error: roleErr } = await supabase
        .from("role")
        .select("id,name")
        .eq("business_id", businessId)
        .order("name");

      if (roleErr) {
        console.error("Error loading roles for announcements:", roleErr);
        return;
      }

      setRoles((roleRows ?? []) as RoleRow[]);
      return (roleRows ?? []) as RoleRow[];
    } catch (e) {
      console.error("Unexpected error loading roles for announcements:", e);
    }
  };

  useEffect(() => {
    (async () => {
      // Load current user + employment to get business context, then load roles
      // and announcements filtered to that business' roles.
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          await fetchAnnouncements(null);
          return;
        }

        const { data: emps, error: empErr } = await supabase
          .from("employment")
          .select("business_id,role_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (empErr) {
          console.error("Error loading employment for announcements:", empErr);
          await fetchAnnouncements(null);
          return;
        }

        const businessId = emps && emps.length > 0 ? emps[0].business_id : null;

        const rolesLoaded = businessId ? await loadAvailableRoles(businessId) : [];
        const businessRoleIds = rolesLoaded ? rolesLoaded.map((r) => r.id) : [];

        await fetchAnnouncements(businessRoleIds.length ? businessRoleIds : null);
      } catch (e) {
        console.error("Unexpected error initializing announcements page:", e);
        await fetchAnnouncements(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateAnnouncement = async (
    title: string,
    content: string,
    targetRoleIds: string[],
  ) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Error getting user:", userError);
    }

    if (!user) {
      alert("You must be logged in to create announcements");
      return;
    }

    const { error } = await supabase.from("announcements").insert([
      {
        title,
        content,
        created_by: user.id,
        // null/empty means broadcast to all roles
        target_role_ids: targetRoleIds.length ? targetRoleIds : null,
      },
    ]);

    if (error) {
      console.error("Error creating announcement:", error);
      alert("Failed to create announcement");
      return;
    }

    await fetchAnnouncements();
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);

    if (error) {
      console.error("Error deleting announcement:", error);
      alert("Failed to delete announcement");
      return;
    }

    await fetchAnnouncements();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-lg">
              <Megaphone className="text-white" size={28} />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Announcements</h1>
          </div>
          <p className="text-foreground/70 ml-14">
            Manage and share important updates with your team
          </p>
        </div>

        <div className="mb-8">
          <AnnouncementForm
            onSubmit={handleCreateAnnouncement}
            availableRoles={roles}
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400" />
            <p className="text-foreground/70 mt-4">Loading announcements...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-background rounded-xl shadow-sm border border-border p-12 text-center">
            <Megaphone className="mx-auto text-foreground/40 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No announcements yet
            </h3>
            <p className="text-foreground/70">
              Create your first announcement to get started
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onDelete={handleDeleteAnnouncement}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

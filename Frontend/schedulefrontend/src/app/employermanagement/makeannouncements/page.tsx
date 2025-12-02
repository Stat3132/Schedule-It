"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Announcement } from "../../../lib/supabase";
import { AnnouncementForm } from "../../../components/ui/AnnouncementForm";
import { AnnouncementCard } from "../../../components/ui/AnnouncementCard";
import {
  normalizeAnnouncementRow,
  type AnnouncementRow,
  createAnnouncement,
  type AnnouncementAttachmentInput,
} from "../../../lib/announcements";
import { uploadMessageAttachment } from "../../../lib/messageAttachments";

type RoleRow = { id: string; name: string };
type ContactOption = { id: string; email: string | null; displayName: string | null };

export default function AnnouncementsPage() {
  const supabase = createClientComponentClient();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [roleFilterIds, setRoleFilterIds] = useState<string[] | null>(null);
  const [emailFilterList, setEmailFilterList] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  const contactOptions = useMemo(
    () =>
      contacts.filter(
        (contact): contact is ContactOption & { email: string } =>
          typeof contact.email === "string" && contact.email.length > 0,
      ),
    [contacts],
  );

  const fetchAnnouncements = useCallback(
    async (businessRoleIds: string[] | null = null, businessEmails: string[] | null = null) => {
      const roleIds = businessRoleIds ?? roleFilterIds;
      const emailList = businessEmails ?? emailFilterList;

    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = ((data ?? []) as AnnouncementRow[]).map(normalizeAnnouncementRow);

        if (roleIds?.length || emailList?.length) {
          const normalizedEmails = (emailList ?? []).map((email) => email.toLowerCase());
          const filtered = rows.filter((announcement) => {
            const isBroadcast =
              announcement.target_role_ids.length === 0 &&
              announcement.target_recipients.length === 0;
            if (isBroadcast) {
              return true;
            }

            const roleMatch =
              roleIds && roleIds.length > 0
                ? announcement.target_role_ids.some((target) => roleIds.includes(target))
                : false;

            const emailMatch = normalizedEmails.length
              ? announcement.target_recipients.some((recipient) =>
                  normalizedEmails.includes(recipient.email.toLowerCase()),
                )
              : false;

            return roleMatch || emailMatch;
          });
          setAnnouncements(filtered);
        } else {
          setAnnouncements(rows);
        }
      } catch (error) {
        console.error("Error fetching announcements:", error);
      } finally {
        setLoading(false);
      }
    },
    [emailFilterList, roleFilterIds, supabase],
  );

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

  const loadBusinessContacts = async (businessId: string) => {
    try {
      const { data: employmentRows, error: employmentError } = await supabase
        .from("employment")
        .select("user_id")
        .eq("business_id", businessId)
        .eq("status", "active");

      if (employmentError) {
        console.error("Error loading employment roster for announcements:", employmentError);
        setContacts([]);
        return [] as ContactOption[];
      }

      const userIds = Array.from(
        new Set(
          (employmentRows ?? [])
            .map((row) => row.user_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (userIds.length === 0) {
        setContacts([]);
        return [] as ContactOption[];
      }

      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, display_name, full_name")
        .in("id", userIds);

      if (profilesError) {
        console.error("Error loading profiles for announcements:", profilesError);
        setContacts([]);
        return [] as ContactOption[];
      }

      const mapped = (profileRows ?? []).map((profile) => ({
        id: profile.id as string,
        email: profile.email ?? null,
        displayName: profile.display_name ?? profile.full_name ?? null,
      }));

      setContacts(mapped);
      return mapped;
    } catch (err) {
      console.error("Unexpected error loading announcement contacts:", err);
      setContacts([]);
      return [] as ContactOption[];
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

        const businessId = emps && emps.length > 0 ? (emps[0].business_id as string | null) : null;

        const rolesLoaded = businessId ? await loadAvailableRoles(businessId) : [];
        const contactsLoaded = businessId ? await loadBusinessContacts(businessId) : [];

        const businessRoleIds = rolesLoaded ? rolesLoaded.map((r) => r.id) : [];
        const businessRoleFilter = businessRoleIds.length ? businessRoleIds : null;
        setRoleFilterIds(businessRoleFilter);

        const emailTargets = contactsLoaded
          .map((contact) => contact.email?.toLowerCase())
          .filter((email): email is string => Boolean(email));
        const emailFilter = emailTargets.length ? emailTargets : null;
        setEmailFilterList(emailFilter);

        await fetchAnnouncements(businessRoleFilter, emailFilter);
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
    targetContacts: { id: string; email: string; displayName: string | null }[],
    attachmentFile: File | null,
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

    const normalizedContacts = targetContacts.filter(
      (contact): contact is { id: string; email: string; displayName: string | null } & { email: string } =>
        Boolean(contact.email),
    );

    let attachment: AnnouncementAttachmentInput | null = null;
    if (attachmentFile) {
      try {
        const uploaded = await uploadMessageAttachment(supabase, attachmentFile, user.id, "announcement");
        attachment = {
          url: uploaded.url,
          name: uploaded.name,
          mime: uploaded.mime,
          size: uploaded.size,
          path: uploaded.path,
        };
      } catch (uploadError) {
        console.error("Error uploading attachment:", uploadError);
        alert("Failed to upload the attachment. Please try again.");
        return;
      }
    }

    const recipients = normalizedContacts.map((contact) => ({
      email: contact.email,
      display_name: contact.displayName,
    }));

    const result = await createAnnouncement(
      supabase,
      user.id,
      title,
      content,
      targetRoleIds.length ? targetRoleIds : null,
      recipients.length ? recipients : null,
      attachment,
    );

    if (!result.success) {
      console.error("Error creating announcement:", result.error);
      alert("Failed to create announcement");
      return;
    }

    await fetchAnnouncements(roleFilterIds, emailFilterList);
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
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-lg">
              <Megaphone className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Announcements</h1>
              <p className="text-foreground/70 text-sm">
                Create targeted updates for your team. Choose roles, specific emails, or broadcast to everyone.
              </p>
            </div>
          </div>

          <AnnouncementForm
            onSubmit={handleCreateAnnouncement}
            availableRoles={roles}
            availableContacts={contactOptions}
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

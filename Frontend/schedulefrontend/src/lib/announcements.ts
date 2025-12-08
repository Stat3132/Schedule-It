import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Announcement,
  AnnouncementAttachment,
  AnnouncementRecipient,
} from "./supabase";


export type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  target_role_ids: string[] | null;
  target_recipient_emails?: string[] | null;
  target_recipient_display_names?: string[] | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_path?: string | null;
};

export type AnnouncementAttachmentInput = {
  url: string;
  name: string | null;
  mime: string | null;
  size: number | null;
  path: string | null;
};

export function normalizeAnnouncementRow(row: AnnouncementRow): Announcement {
  const normalizedTargets = Array.isArray(row.target_role_ids)
    ? row.target_role_ids.filter((id): id is string => Boolean(id))
    : [];

  const rawEmails = Array.isArray(row.target_recipient_emails)
    ? row.target_recipient_emails.filter((email): email is string => Boolean(email))
    : [];
  const rawLabels = Array.isArray(row.target_recipient_display_names)
    ? row.target_recipient_display_names
    : [];
  const normalizedRecipients: AnnouncementRecipient[] = rawEmails.map((email, index) => ({
    email,
    display_name: rawLabels[index] ?? null,
  }));

  const hasAttachment = Boolean(row.attachment_url);
  const normalizedAttachment: AnnouncementAttachment | null = hasAttachment
    ? {
        url: row.attachment_url as string,
        name: row.attachment_name ?? null,
        mime: row.attachment_mime ?? null,
        size:
          typeof row.attachment_size === "number"
            ? row.attachment_size
            : row.attachment_size
              ? Number(row.attachment_size)
              : null,
        path: row.attachment_path ?? null,
      }
    : null;

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: (row as { updated_at?: string }).updated_at ?? row.created_at,
    target_role_ids: normalizedTargets,
    target_recipients: normalizedRecipients,
    attachment: normalizedAttachment,
  };
}

export async function markAnnouncementsAsRead(
  supabase: SupabaseClient,
  userId: string,
  announcementIds: string[],
) {
  if (!announcementIds.length) return;
  try {
    const rows = announcementIds.map(id => ({
      announcement_id: id,
      user_id: userId,
      read_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("announcement_receipt")
      .upsert(rows, { onConflict: "announcement_id,user_id" });
    if (error) {
      console.error("[Announcements] mark read error", error);
    }
  } catch (err) {
    console.error("[Announcements] unexpected mark read error", err);
  }
}

export async function createAnnouncement(
  supabase: SupabaseClient,
  createdBy: string,
  title: string,
  content: string,
  targetRoleIds: string[] | null = null,
  targetRecipients?: AnnouncementRecipient[] | null,
  attachment?: AnnouncementAttachmentInput | null,
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const normalizedTargets = targetRoleIds && targetRoleIds.length ? targetRoleIds : null;
    const insert = {
      title,
      content,
      created_by: createdBy,
      target_role_ids: normalizedTargets,
      target_recipient_emails:
        targetRecipients && targetRecipients.length
          ? targetRecipients.map((recipient) => recipient.email)
          : null,
      target_recipient_display_names:
        targetRecipients && targetRecipients.length
          ? targetRecipients.map((recipient) => recipient.display_name)
          : null,
      attachment_url: attachment?.url ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_path: attachment?.path ?? null,
    } as Record<string, unknown>;

    const { error } = await supabase.from("announcements").insert(insert);
    if (error) {
      console.error("[Announcements] create error", error);
      return { success: false, error };
    }
    return { success: true };
  } catch (err) {
    console.error("[Announcements] unexpected error", err);
    return { success: false, error: err };
  }
}

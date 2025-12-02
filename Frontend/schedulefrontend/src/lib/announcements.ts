import type { SupabaseClient } from "@supabase/supabase-js";
import type { Announcement } from "./supabase";

export type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string;
  target_role_ids: string[] | null;
};

export function normalizeAnnouncementRow(row: AnnouncementRow): Announcement {
  const normalizedTargets = Array.isArray(row.target_role_ids)
    ? row.target_role_ids.filter((id): id is string => Boolean(id))
    : [];

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: (row as { updated_at?: string }).updated_at ?? row.created_at,
    target_role_ids: normalizedTargets,
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
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const normalizedTargets = targetRoleIds && targetRoleIds.length ? targetRoleIds : null;
    const insert = {
      title,
      content,
      created_by: createdBy,
      target_role_ids: normalizedTargets,
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

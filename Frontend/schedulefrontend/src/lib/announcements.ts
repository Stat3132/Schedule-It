import type { SupabaseClient } from "@supabase/supabase-js";

export async function createAnnouncement(
  supabase: SupabaseClient,
  createdBy: string,
  title: string,
  content: string,
  targetRoleIds: string[] | null = null,
): Promise<{ success: boolean; error?: unknown }> {
  try {
    const insert = {
      title,
      content,
      created_by: createdBy,
      target_role_ids: targetRoleIds ?? [],
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

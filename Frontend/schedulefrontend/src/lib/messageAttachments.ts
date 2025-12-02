import type { SupabaseClient } from "@supabase/supabase-js";

export const MESSAGE_ATTACHMENT_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_MESSAGE_BUCKET ?? "message-attachments";
export const MAX_MESSAGE_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB

export type UploadedAttachment = {
  url: string;
  path: string;
  name: string;
  mime: string;
  size: number;
};

export async function uploadMessageAttachment(
  supabase: SupabaseClient,
  file: File,
  userId: string,
  scope: "dm" | "group",
): Promise<UploadedAttachment> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${scope}/${userId}/${Date.now()}-${sanitizedName}`;
  const { error } = await supabase.storage
    .from(MESSAGE_ATTACHMENT_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MESSAGE_ATTACHMENT_BUCKET).getPublicUrl(path);

  if (!publicUrl) {
    throw new Error("Unable to resolve attachment URL");
  }

  return {
    url: publicUrl,
    path,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
  };
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

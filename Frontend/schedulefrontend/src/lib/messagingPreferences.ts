import type { SupabaseClient } from "@supabase/supabase-js";

export type BlockMap = {
  blockedByMe: Record<string, boolean>;
  blockedMe: Record<string, boolean>;
};

export type MuteMap = {
  dm: Record<string, boolean>;
  group: Record<string, boolean>;
};

async function resolveCurrentUserId(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function fetchBlockMap(
  supabase: SupabaseClient,
  currentUserId: string | null,
): Promise<BlockMap> {
  if (!currentUserId) {
    return { blockedByMe: {}, blockedMe: {} };
  }

  const { data, error } = await supabase
    .from("blocked_user")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);

  if (error || !data) {
    console.error("Unable to load block relationships", error);
    return { blockedByMe: {}, blockedMe: {} };
  }

  const blockedByMe: Record<string, boolean> = {};
  const blockedMe: Record<string, boolean> = {};

  data.forEach((row) => {
    const blockerId = row.blocker_id as string;
    const blockedId = row.blocked_id as string;
    if (blockerId === currentUserId) {
      blockedByMe[blockedId] = true;
    }
    if (blockedId === currentUserId) {
      blockedMe[blockerId] = true;
    }
  });

  return { blockedByMe, blockedMe };
}

export async function fetchMuteMap(
  supabase: SupabaseClient,
  currentUserId: string | null,
): Promise<MuteMap> {
  if (!currentUserId) {
    return { dm: {}, group: {} };
  }

  const { data, error } = await supabase
    .from("muted_thread")
    .select("thread_type, target_id")
    .eq("user_id", currentUserId);

  if (error || !data) {
    console.error("Unable to load mute preferences", error);
    return { dm: {}, group: {} };
  }

  const dm: Record<string, boolean> = {};
  const group: Record<string, boolean> = {};

  data.forEach((row) => {
    const targetId = row.target_id as string;
    const threadType = row.thread_type as "dm" | "group";
    if (threadType === "group") {
      group[targetId] = true;
    } else {
      dm[targetId] = true;
    }
  });

  return { dm, group };
}

export async function blockUser(
  supabase: SupabaseClient,
  blockerId: string | null,
  targetId: string,
) {
  const finalBlocker = blockerId ?? (await resolveCurrentUserId(supabase));
  if (!finalBlocker) throw new Error("Missing blocker id");
  return supabase.from("blocked_user").upsert({ blocker_id: finalBlocker, blocked_id: targetId });
}

export async function unblockUser(
  supabase: SupabaseClient,
  blockerId: string | null,
  targetId: string,
) {
  const finalBlocker = blockerId ?? (await resolveCurrentUserId(supabase));
  if (!finalBlocker) throw new Error("Missing blocker id");
  return supabase
    .from("blocked_user")
    .delete()
    .eq("blocker_id", finalBlocker)
    .eq("blocked_id", targetId);
}

export async function muteThread(
  supabase: SupabaseClient,
  userId: string | null,
  type: "dm" | "group",
  targetId: string,
) {
  const finalUser = userId ?? (await resolveCurrentUserId(supabase));
  if (!finalUser) throw new Error("Missing user id");
  return supabase
    .from("muted_thread")
    .upsert({ user_id: finalUser, thread_type: type, target_id: targetId });
}

export async function unmuteThread(
  supabase: SupabaseClient,
  userId: string | null,
  type: "dm" | "group",
  targetId: string,
) {
  const finalUser = userId ?? (await resolveCurrentUserId(supabase));
  if (!finalUser) throw new Error("Missing user id");
  return supabase
    .from("muted_thread")
    .delete()
    .eq("user_id", finalUser)
    .eq("thread_type", type)
    .eq("target_id", targetId);
}

export async function leaveGroup(
  supabase: SupabaseClient,
  groupId: string,
) {
  return supabase.rpc("leave_group", { p_group_id: groupId });
}

export async function removeGroupMember(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
) {
  return supabase.rpc("remove_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
  });
}

export async function deleteGroupThread(
  supabase: SupabaseClient,
  groupId: string,
) {
  return supabase.rpc("delete_group_thread", { p_group_id: groupId });
}

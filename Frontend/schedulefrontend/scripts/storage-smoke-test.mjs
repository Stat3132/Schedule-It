#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROFILE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_PROFILE_BUCKET || "profile-photos";

async function main() {
  if (!SUPABASE_URL) {
    console.error("[storage-smoke] Missing NEXT_PUBLIC_SUPABASE_URL in environment");
    process.exit(1);
  }

  if (!SERVICE_ROLE_KEY) {
    console.error(
      "[storage-smoke] Missing SUPABASE_STORAGE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) in environment",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        "x-client-info": "storage-smoke-test",
      },
    },
  });

  const folder = "smoke-tests";
  const filename = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.txt`;
  const objectPath = `${folder}/${filename}`;
  const payload = new Blob([`storage smoke test @ ${new Date().toISOString()}`], {
    type: "text/plain",
  });

  console.log(`[storage-smoke] Uploading test object to ${PROFILE_BUCKET}/${objectPath}`);
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(objectPath, payload, {
      contentType: "text/plain",
      upsert: true,
      cacheControl: "60",
    });

  if (uploadError) {
    console.error("[storage-smoke] Upload failed", uploadError);
    process.exit(1);
  }

  const { data: listing, error: listError } = await supabase.storage
    .from(PROFILE_BUCKET)
    .list(folder, { limit: 50, offset: 0, sortBy: { column: "name", order: "desc" } });

  if (listError) {
    console.error("[storage-smoke] Unable to list folder contents", listError);
    await cleanup(supabase, objectPath);
    process.exit(1);
  }

  const found = (listing ?? []).some((entry) => entry.name === filename);
  if (!found) {
    console.error("[storage-smoke] Uploaded file not found in listing response");
    await cleanup(supabase, objectPath);
    process.exit(1);
  }

  console.log("[storage-smoke] Object visible in listing. Cleaning up…");
  const removed = await cleanup(supabase, objectPath);
  if (!removed) {
    console.error("[storage-smoke] Failed to delete temporary object");
    process.exit(1);
  }

  console.log("[storage-smoke] Storage bucket is reachable ✅");
}

async function cleanup(client, path) {
  const { error } = await client.storage.from(PROFILE_BUCKET).remove([path]);
  if (error) {
    console.warn(`[storage-smoke] Cleanup failed for ${path}`, error);
    return false;
  }
  return true;
}

await main();

"use client";

import React, { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestError } from "@supabase/supabase-js";

type RoleRow = {
  id: string;
  business_id: string;
  name: string;
  color: string | null;
  min_skill_level: number | null;
};

type Biz = {
  id: string;
  verification_status: "unverified" | "docs_submitted" | "verified" | "rejected";
};

function isUUID(s?: string): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

function hasPgCode(e: unknown): e is PostgrestError {
  return typeof e === "object" && e !== null && "message" in e;
}

export default function RolesPage(): JSX.Element {
  const supabase = createClientComponentClient();

  // Read /employeronboarding/roles/[businessid]
  // NOTE: route folder uses [businessid] (lowercase) so useParams may expose either key depending on file/folder naming.
  const params = useParams();
  // Accept either `businessId` or `businessid` keys and guard for possible string[] values.
  const rawParam = (params as Record<string, unknown>)?.businessId ?? (params as Record<string, unknown>)?.businessid;
  const rawStr = Array.isArray(rawParam) ? (rawParam[0] as string | undefined) : (rawParam as string | undefined);
  const businessId: string | null = rawStr ?? null;

  const hasValidBizId = isUUID(businessId || undefined);
  const bizId = hasValidBizId ? (businessId as string) : null;

  const [loading, setLoading] = useState(true);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [err, setErr] = useState<string>("");

  // form state
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [minSkill, setMinSkill] = useState("");

  const verified = useMemo(() => biz?.verification_status === "verified", [biz]);

  // Load business + roles
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!hasValidBizId) {
        setErr("Invalid business id");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr("");

      const { data: b, error: bErr } = await supabase
        .from("business")
        .select("id, verification_status")
        .eq("id", bizId)
        .maybeSingle();

      if (!alive) return;

      if (bErr) {
        setErr(bErr.message);
        setLoading(false);
        return;
      }

      setBiz(b ?? null);

      const { data: r, error: rErr } = await supabase
        .from("role")
        .select("id,business_id,name,color,min_skill_level")
        .eq("business_id", bizId!)
        .order("name", { ascending: true });

      if (!alive) return;

      if (rErr) setErr(rErr.message);
      setRoles(r ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [bizId, hasValidBizId, supabase]);

  // Create role
  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!hasValidBizId) {
      setErr("Invalid business id");
      return;
    }
    if (!verified) {
      setErr("Business not verified");
      return;
    }
    if (!name.trim()) {
      setErr("Name required");
      return;
    }
    if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) {
      setErr("Color must be 6-digit hex");
      return;
    }

    const payload = {
      business_id: bizId!,
      name: name.trim(),
      color: color ? (color.startsWith("#") ? color : `#${color}`) : null,
      min_skill_level: minSkill ? Number.parseInt(minSkill, 10) : null,
    };

    const { data, error } = await supabase.from("role").insert(payload).select().single();

    if (error) {
      if (hasPgCode(error) && (error.code === "23505" || error.message.includes("duplicate"))) {
        setErr("Role name already exists in this business");
      } else if (hasPgCode(error) && error.code === "42501") {
        setErr("Not authorized to add roles");
      } else {
        setErr(error.message);
      }
      return;
    }

    const inserted = data as RoleRow;
    setRoles((prev) => [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)));
    setName("");
    setColor("");
    setMinSkill("");
  }

  // Update role
  async function updateRole(id: string, patch: Partial<RoleRow>) {
    setErr("");

    const { data, error } = await supabase
      .from("role")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (hasPgCode(error) && (error.code === "23505" || error.message.includes("duplicate"))) {
        setErr("Duplicate role name");
      } else {
        setErr(error.message);
      }
      return;
    }

    const updated = data as RoleRow;
    setRoles((prev) =>
      prev.map((r) => (r.id === id ? updated : r)).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  // Delete role
  async function deleteRole(id: string) {
    setErr("");

    const { error } = await supabase.from("role").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-start justify-center">
      <div className="w-full max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold">Roles</h1>

        {!verified && (
          <div className="rounded border border-yellow-400 bg-yellow-50 p-3 text-sm">
            Business is not verified. You can view roles but cannot add, edit, or delete.
          </div>
        )}

        <form onSubmit={createRole} className="grid gap-3 max-w-lg mt-4">
          <label className="grid gap-1">
            <span className="text-sm">Role name</span>
            <input
              className="border rounded p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Server"
              disabled={!verified}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Color (hex)</span>
            <input
              className="border rounded p-2"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#2DD4BF"
              disabled={!verified}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm">Min skill level</span>
            <input
              type="number"
              className="border rounded p-2"
              value={minSkill}
              onChange={(e) => setMinSkill(e.target.value)}
              placeholder="optional"
              disabled={!verified}
            />
          </label>

          <button
            type="submit"
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            disabled={!verified}
          >
            Add role
          </button>

          {err && <div className="text-red-600 text-sm">{err}</div>}
        </form>

        <div className="grid gap-3 mt-6">
          {roles.length === 0 ? (
            <div className="text-sm text-neutral-600">No roles yet.</div>
          ) : (
            roles.map((r) => (
              <RoleItem
                key={r.id}
                role={r}
                businessId={bizId ?? ""}
                disabled={!verified}
                onSave={(patch) => updateRole(r.id, patch)}
                onDelete={() => deleteRole(r.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function RoleItem(props: {
  role: RoleRow;
  businessId: string;
  disabled: boolean;
  onSave: (patch: Partial<RoleRow>) => void;
  onDelete: () => void;
}): JSX.Element {
  const { role, businessId, disabled, onSave, onDelete } = props;
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? "");
  const [minSkill, setMinSkill] = useState(role.min_skill_level?.toString() ?? "");

  function save() {
    const patch: Partial<RoleRow> = {
      name: name.trim(),
      color: color ? (color.startsWith("#") ? color : `#${color}`) : null,
      min_skill_level: minSkill ? Number.parseInt(minSkill, 10) : null,
    };
    onSave(patch);
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 border rounded p-3">
      <div className="w-5 h-5 rounded" style={{ background: color || "#e5e7eb" }} />
      {!editing ? (
        <>
          <div className="flex-1">
            <div className="font-medium">{role.name}</div>
            <div className="text-sm text-neutral-600">
              {role.color || "no color"} · skill {role.min_skill_level ?? "—"}
            </div>
          </div>
          <button className="px-3 py-1 border rounded" onClick={() => setEditing(true)} disabled={disabled}>
            Edit
          </button>
          <button className="px-3 py-1 border rounded" onClick={onDelete} disabled={disabled}>
            Delete
          </button>
        </>
      ) : (
        <>
          <input className="border rounded p-1" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} />
          <input className="border rounded p-1" value={color} onChange={(e) => setColor(e.target.value)} disabled={disabled} placeholder="#000000" />
          <input className="border rounded p-1" value={minSkill} onChange={(e) => setMinSkill(e.target.value)} disabled={disabled} type="number" />
          <button className="px-3 py-1 border rounded" onClick={save} disabled={disabled}>
            Save
          </button>
          <button className="px-3 py-1 border rounded" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button
            className="px-4 py-2 border rounded"
            disabled={!isUUID(businessId)}
            onClick={() => router.push(`/employeronboarding/team/${businessId}`)}
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}

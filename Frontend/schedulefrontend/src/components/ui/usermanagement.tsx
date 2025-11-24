"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestError } from "@supabase/supabase-js";
import { Check, X, ChevronDown } from "lucide-react";

type UUID = string;

type Business = {
  id: UUID;
  name: string;
  verification_status: "unverified" | "docs_submitted" | "verified" | "rejected";
};

type Role = { id: UUID; business_id: UUID; name: string; color: string | null };
type Location = { id: UUID; business_id: UUID; name: string; address: string | null };

type Invite = {
  id: UUID;
  business_id: UUID;
  email: string;
  role_id: UUID | null;
  location_id: UUID | null;
  is_manager: boolean;
  is_admin: boolean;
  token: UUID;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: UUID | null;
  invited_at: string | null;
  accepted_at?: string | null;
};

type Employment = {
  id: UUID;
  user_id: UUID;
  business_id: UUID;
  location_id: UUID | null;
  role_id: UUID | null;
  status: "invited" | "active" | "inactive" | "terminated";
  is_manager: boolean;
  is_admin: boolean;
  permissions: Record<string, unknown> | null;
};

type CoworkerProfile = { id: UUID; email: string | null; full_name: string | null };

type JoinRequest = {
  id: UUID;
  business_id: UUID;
  requester_user_id: UUID;
  requested_role_id: UUID | null;
  requested_location_id: UUID | null;
  message: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
  created_at: string;
};

type Props = { businessId: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function UserManagement({ businessId }: Props) {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [biz, setBiz] = useState<Business | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [pendingEmps, setPendingEmps] = useState<(Employment & { profile: CoworkerProfile | null })[]>([]);
  const [joinRequests, setJoinRequests] = useState<(JoinRequest & { profile: CoworkerProfile | null })[]>([]);

  type AcceptTarget =
    | { kind: "invite"; invite: Invite }
    | { kind: "employment"; employment: Employment & { profile: CoworkerProfile | null } }
    | { kind: "request"; request: JoinRequest & { profile: CoworkerProfile | null } }
    | null;

  const [openTarget, setOpenTarget] = useState<AcceptTarget>(null);
  const [formRoleId, setFormRoleId] = useState<UUID | "">("");
  const [formIsMgr, setFormIsMgr] = useState(false);
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formAllowedLocs, setFormAllowedLocs] = useState<UUID[]>([]);
  const [formPrimaryLocId, setFormPrimaryLocId] = useState<UUID | "">("");

  useEffect(() => {
    if (!businessId) {
      setError("Missing business id.");
      setLoading(false);
      return;
    }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      // business
      const { data: bizRows, error: bizErr } = await supabase
        .from("business")
        .select("id,name,verification_status")
        .eq("id", businessId)
        .limit(1);
      if (bizErr) throw bizErr;
      const found = bizRows?.[0] ?? null;
      if (!found) {
        setError("Business not found or no access.");
        setBiz(null);
        setRoles([]); setLocations([]); setInvites([]); setPendingEmps([]); setJoinRequests([]);
        return;
      }
      setBiz(found);

      // roles
      const { data: roleRows, error: roleErr } = await supabase
        .from("role").select("id,business_id,name,color")
        .eq("business_id", businessId).order("name", { ascending: true });
      if (roleErr) throw roleErr;
      setRoles(roleRows ?? []);

      // locations
      const { data: locRows, error: locErr } = await supabase
        .from("location").select("id,business_id,name,address")
        .eq("business_id", businessId).order("name", { ascending: true });
      if (locErr) throw locErr;
      setLocations(locRows ?? []);

      // invites
      const { data: invRows, error: invErr } = await supabase
        .from("employee_invite")
        .select("id,business_id,email,role_id,location_id,is_manager,is_admin,token,status,invited_by,invited_at,accepted_at")
        .eq("business_id", businessId).eq("status", "pending")
        .order("invited_at", { ascending: false });
      if (invErr) throw invErr;
      setInvites(invRows ?? []);

      // pending employments
      const { data: empRows, error: empErr } = await supabase
        .from("employment")
        .select("id,user_id,business_id,location_id,role_id,status,is_manager,is_admin,permissions")
        .eq("business_id", businessId)
        .in("status", ["invited", "inactive"])
        .order("id", { ascending: true });
      if (empErr) throw empErr;

      const empUserIds = (empRows ?? []).map(e => e.user_id);

      // join requests
      const { data: reqRows, error: reqErr } = await supabase
        .from("employee_join_request")
        .select("id,business_id,requester_user_id,requested_role_id,requested_location_id,message,status,created_at")
        .eq("business_id", businessId).eq("status","pending")
        .order("created_at",{ ascending:false });
      if (reqErr) throw reqErr;

      const reqUserIds = (reqRows ?? []).map(r => r.requester_user_id);
      const userIds = [...new Set([...empUserIds, ...reqUserIds])];

      const profilesById = new Map<string, CoworkerProfile>();
      if (userIds.length) {
        const { data: profRows, error: profErr } = await supabase
          .from("profiles").select("id,email,full_name").in("id", userIds);
        if (profErr) throw profErr;
        for (const p of profRows ?? []) profilesById.set(p.id, p);
      }

      setPendingEmps(
        (empRows ?? []).map(e => ({ ...e, profile: profilesById.get(e.user_id) ?? null }))
      );

      setJoinRequests(
        (reqRows ?? []).map(r => ({ ...r, profile: profilesById.get(r.requester_user_id) ?? null }))
      );
    } catch (e) {
      const msg = (e as PostgrestError)?.message ?? "Failed to load";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const verified = biz?.verification_status === "verified";
  const disabledUI = !verified;

  function openAcceptForInvite(invite: Invite) {
    setOpenTarget({ kind: "invite", invite });
    setFormRoleId(invite.role_id ?? "");
    setFormIsMgr(invite.is_manager);
    setFormIsAdmin(invite.is_admin);
    setFormPrimaryLocId(invite.location_id ?? "");
    setFormAllowedLocs(invite.location_id ? [invite.location_id] : []);
  }

  function openAcceptForEmployment(emp: Employment & { profile: CoworkerProfile | null }) {
    setOpenTarget({ kind: "employment", employment: emp });
    setFormRoleId(emp.role_id ?? "");
    setFormIsMgr(emp.is_manager);
    setFormIsAdmin(emp.is_admin);
    const perms = (emp.permissions ?? {}) as Record<string, unknown>;
    const allowed = Array.isArray(perms.locations_allowed) ? (perms.locations_allowed as string[]) : [];
    setFormAllowedLocs(allowed);
    setFormPrimaryLocId(emp.location_id ?? "");
  }

  function openAcceptForRequest(req: JoinRequest & { profile: CoworkerProfile | null }) {
    setOpenTarget({ kind: "request", request: req });
    setFormRoleId(req.requested_role_id ?? "");
    setFormIsMgr(false);
    setFormIsAdmin(false);
    setFormPrimaryLocId(req.requested_location_id ?? "");
    setFormAllowedLocs(req.requested_location_id ? [req.requested_location_id] : []);
  }

  function resetPanel() {
    setOpenTarget(null);
    setFormRoleId("");
    setFormIsMgr(false);
    setFormIsAdmin(false);
    setFormAllowedLocs([]);
    setFormPrimaryLocId("");
  }

  async function declineInvite(id: UUID) {
    const { error: err } = await supabase
      .from("employee_invite")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("business_id", businessId);
    if (err) { setError(err.message); return; }
    await loadAll();
  }

  async function denyRequest(id: UUID) {
    const { error } = await supabase.rpc("deny_join_request", { p_request: id });
    if (error) { setError(error.message); return; }
    await loadAll();
  }

  async function acceptSave() {
    if (!verified || !openTarget) return;

    const permissions = {
      ...(openTarget.kind === "employment" ? openTarget.employment.permissions : {}),
      locations_allowed: formAllowedLocs,
    };

    if (openTarget.kind === "invite") {
      const inv = openTarget.invite;

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", inv.email)
        .limit(1)
        .single();
      if (pErr) { setError("User has not signed up yet."); return; }

      const { error: upErr } = await supabase
        .from("employment")
        .upsert(
          {
            user_id: prof.id,
            business_id: inv.business_id,
            role_id: formRoleId || null,
            location_id: formPrimaryLocId || null,
            status: "active",
            is_manager: formIsMgr,
            is_admin: formIsAdmin,
            permissions,
          },
          { onConflict: "user_id,business_id" }
        );
      if (upErr) { setError(upErr.message); return; }

      const { error: iErr } = await supabase
        .from("employee_invite")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("business_id", businessId);
      if (iErr) { setError(iErr.message); return; }
    } else if (openTarget.kind === "employment") {
      const emp = openTarget.employment;
      const { error: empErr } = await supabase
        .from("employment")
        .update({
          status: "active",
          role_id: formRoleId || null,
          location_id: formPrimaryLocId || null,
          is_manager: formIsMgr,
          is_admin: formIsAdmin,
          permissions,
        })
        .eq("id", emp.id)
        .eq("business_id", businessId);
      if (empErr) { setError(empErr.message); return; }
    } else {
      const req = openTarget.request;
      const { error } = await supabase.rpc("approve_join_request", {
        p_request: req.id,
        p_role: formRoleId || null,
        p_location: formPrimaryLocId || null,
        p_is_manager: formIsMgr,
        p_is_admin: formIsAdmin,
      });
      if (error) { setError(error.message); return; }
    }

    resetPanel();
    await loadAll();
  }

  /* ---------- UI ---------- */
  return (
    <main className="relative min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <header className="mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.replace("/employermanagement/employerhomepage")}
              className="px-3 py-2 rounded-lg border border-border text-foreground hover:bg-background/95"
            >
              Back to Home
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">User management</h1>
          </div>
          {biz && (
            <div className="mt-1 text-sm text-foreground/70">
              <span className="font-medium">{biz.name}</span>
              <span className="mx-2">·</span>
              <span>
                Verification:
                <span className={cx("ml-1", biz.verification_status === "verified" ? "text-green-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300")}>
                  {biz.verification_status}
                </span>
              </span>
            </div>
          )}
        </header>

        {error && <div className="mb-4 rounded-md bg-rose-50 text-rose-700 px-3 py-2 text-sm dark:bg-rose-900 dark:text-rose-200">{error}</div>}

        {loading ? (
          <div className="text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Pending invites */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1">
                <div className="px-4 py-3 border-b font-medium">Pending invites</div>
                <ul className="divide-y">
                  {invites.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending invites.</li>}
                {invites.map(inv => (
                  <li key={inv.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{inv.email}</div>
                          <div className="text-xs text-foreground/60">
                          Role: {roles.find(r => r.id === inv.role_id)?.name ?? "—"} ·{" "}
                          Location: {locations.find(l => l.id === inv.location_id)?.name ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={() => openAcceptForInvite(inv)}
                          disabled={disabledUI}
                          title={disabledUI ? "Business must be verified" : "Accept"}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-4 h-4" /> Accept
                          </span>
                        </button>
                        <button
                          className="px-3 py-1 rounded-md bg-rose-600 text-white text-sm dark:bg-rose-600 dark:hover:bg-rose-700"
                          onClick={() => declineInvite(inv.id)}
                          title="Decline"
                        >
                          <span className="inline-flex items-center gap-1">
                            <X className="w-4 h-4" /> Decline
                          </span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pending activations */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1">
              <div className="px-4 py-3 border-b font-medium">Pending activations</div>
              <ul className="divide-y">
                {pendingEmps.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending activations.</li>}
                {pendingEmps.map(emp => (
                  <li key={emp.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {emp.profile?.full_name || emp.profile?.email || emp.user_id}
                        </div>
                        <div className="text-xs text-foreground/60">
                          Status: {emp.status} · Role: {roles.find(r => r.id === emp.role_id)?.name ?? "—"} ·{" "}
                          Primary: {locations.find(l => l.id === emp.location_id)?.name ?? "—"}
                        </div>
                      </div>
                      <button
                        className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                        onClick={() => openAcceptForEmployment(emp)}
                        disabled={disabledUI}
                        title={disabledUI ? "Business must be verified" : "Activate"}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Check className="w-4 h-4" /> Activate
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Join requests */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1">
              <div className="px-4 py-3 border-b font-medium">Join requests</div>
              <ul className="divide-y">
                {joinRequests.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending requests.</li>}
                {joinRequests.map(req => (
                  <li key={req.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {req.profile?.full_name || req.profile?.email || req.requester_user_id}
                        </div>
                        <div className="text-xs text-foreground/60">
                          Requested role: {roles.find(r => r.id === req.requested_role_id)?.name ?? "—"} ·{" "}
                          Requested location: {locations.find(l => l.id === req.requested_location_id)?.name ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={() => openAcceptForRequest(req)}
                          disabled={disabledUI}
                          title={disabledUI ? "Business must be verified" : "Approve"}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-4 h-4" /> Approve
                          </span>
                        </button>
                        <button
                          className="px-3 py-1 rounded-md bg-rose-600 text-white text-sm dark:bg-rose-600 dark:hover:bg-rose-700"
                          onClick={() => denyRequest(req.id)}
                          title="Deny"
                        >
                          <span className="inline-flex items-center gap-1">
                            <X className="w-4 h-4" /> Deny
                          </span>
                        </button>
                      </div>
                    </div>
                    {req.message && <p className="mt-1 text-xs text-foreground/70">{req.message}</p>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* Inline accept panel */}
        {openTarget && (
          <div className="mt-6 bg-background border border-border rounded-xl shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 border-b"
              onClick={() => setOpenTarget(openTarget ? null : openTarget)}
            >
              <div className="font-medium">
                {openTarget.kind === "invite" && `Accept invite: ${openTarget.invite.email}`} 
                {openTarget.kind === "employment" &&
                  `Activate: ${openTarget.employment.profile?.full_name || openTarget.employment.profile?.email || openTarget.employment.user_id}`}
                {openTarget.kind === "request" &&
                  `Approve request: ${openTarget.request.profile?.full_name || openTarget.request.profile?.email || openTarget.request.requester_user_id}`}
              </div>
              <ChevronDown className="w-4 h-4" />
            </button>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1 text-foreground">Role</label>
                <select
                  value={formRoleId}
                  onChange={e => setFormRoleId(e.target.value as UUID | "")}
                  className="w-full border border-border rounded-md px-3 py-2 bg-transparent text-foreground"
                >
                  <option value="">No role</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1 text-foreground">Primary location</label>
                <select
                  value={formPrimaryLocId}
                  onChange={e => setFormPrimaryLocId(e.target.value as UUID | "")}
                  className="w-full border border-border rounded-md px-3 py-2 bg-transparent text-foreground"
                >
                  <option value="">None</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm mb-1 text-foreground">Allowed locations</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {locations.map(l => {
                    const checked = formAllowedLocs.includes(l.id);
                    return (
                      <label key={l.id} className="inline-flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={checked}
                          onChange={() =>
                            setFormAllowedLocs(prev => checked ? prev.filter(x => x !== l.id) : [...prev, l.id])
                          }
                        />
                        <span>{l.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-foreground/60 mt-1">
                  Stored in <code>employment.permissions.locations_allowed</code>.
                </p>
              </div>

              <div className="flex items-center gap-6">
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" className="accent-primary" checked={formIsMgr} onChange={e => setFormIsMgr(e.target.checked)} />
                  Manager
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" className="accent-primary" checked={formIsAdmin} onChange={e => setFormIsAdmin(e.target.checked)} />
                  Admin
                </label>
              </div>

              <div className="md:col-span-2 flex gap-2">
                <button
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  onClick={acceptSave}
                  disabled={!verified}
                  title={verified ? "Save" : "Business must be verified"}
                >
                  Save
                </button>
                <button className="px-4 py-2 rounded-md border border-border text-sm text-foreground" onClick={resetPanel}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

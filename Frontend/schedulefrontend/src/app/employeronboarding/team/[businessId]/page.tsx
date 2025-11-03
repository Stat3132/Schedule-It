"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Member = { id: string; email: string; role: string | null };
type RoleOpt = { id: string; name: string };
type LocOpt  = { id: string; name: string };

type InviteResult = {
  email: string;
  joinUrl: string;
  emailed: boolean;
  error?: string;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function parseEmails(raw: string): string[] {
  const emails = raw
    .split(/[\s,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) if (!seen.has(e)) { seen.add(e); out.push(e); }
  return out;
}

export default function TeamPage() {
  const router = useRouter();
  const { businessId } = useParams<{ businessId: string }>();
  const supabase = createClientComponentClient();

  // authz
  const [canInvite, setCanInvite] = useState<boolean | null>(null);
  const [authzMsg, setAuthzMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: mgr }, { data: ver }] = await Promise.all([
        supabase.rpc("is_manager",  { biz: String(businessId) }),
        supabase.rpc("is_verified", { biz: String(businessId) }),
      ]);
      if (!alive) return;
      const ok = Boolean(mgr) && Boolean(ver);
      setCanInvite(ok);
      setAuthzMsg(!mgr ? "Not authorized. Manager access required." : !ver ? "Business is not verified." : "");
    })();
    return () => { alive = false; };
  }, [businessId, supabase]);

  // members
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersErr, setMembersErr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoadingMembers(true);
    setMembersErr("");
    (async () => {
      const { data, error } = await supabase
        .from("employment")
        .select("user:profiles(id,email), role:role(name)")
        .eq("business_id", String(businessId))
        .eq("status", "active");
      if (!alive) return;
      if (error) {
        setMembersErr(error.message || "Failed to load team.");
        setMembers([]);
      } else {
  type Row = { user: unknown; role: unknown };
  const rows: Row[] = (data ?? []) as Row[];
        const toUser = (u: unknown): { id: string; email: string } | null => {
          const val = Array.isArray(u) ? u[0] : u;
          if (val && typeof val === "object") {
            const r = val as Record<string, unknown>;
            const id = r.id;
            const email = r.email;
            if ((typeof id === "string" || typeof id === "number") && typeof email === "string") {
              return { id: String(id), email };
            }
          }
          return null;
        };
        const toRole = (r: unknown): string | null => {
          const val = Array.isArray(r) ? r[0] : r;
          if (val && typeof val === "object") {
            const name = (val as Record<string, unknown>).name;
            if (typeof name === "string") return name;
          }
          return null;
        };
        setMembers(
          rows.map((row) => {
            const u = toUser(row.user);
            return { id: u?.id ?? "", email: u?.email ?? "", role: toRole(row.role) };
          })
        );
      }
      setLoadingMembers(false);
    })();
    return () => { alive = false; };
  }, [businessId, supabase]);

  // dropdowns
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [locs,  setLocs]  = useState<LocOpt[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: r }, { data: l }] = await Promise.all([
        supabase.from("role").select("id,name").eq("business_id", String(businessId)).order("name"),
        supabase.from("location").select("id,name").eq("business_id", String(businessId)).order("name"),
      ]);
      if (!alive) return;
      if (r) setRoles(r as RoleOpt[]);
      if (l) setLocs(l as LocOpt[]);
    })();
    return () => { alive = false; };
  }, [businessId, supabase]);

  // invite form
  const [rawEmails, setRawEmails] = useState("");
  const emails = useMemo(() => parseEmails(rawEmails), [rawEmails]);

  const [roleId, setRoleId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [out, setOut] = useState<InviteResult[]>([]);
  const [formErr, setFormErr] = useState("");
  const [sending, setSending] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function sendInvites(e: React.FormEvent) {
    e.preventDefault();
    setFormErr("");
    setOut([]);

    if (!canInvite) {
      setFormErr(authzMsg || "Not allowed.");
      return;
    }
    if (emails.length === 0) {
      setFormErr("Enter at least one valid email.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/invitation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: String(businessId),
          invites: emails.map(email => ({
            email,
            roleId: roleId || undefined,
            locationId: locationId || undefined,
            isManager,
            isAdmin,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormErr(json.error ?? "Failed to create invites.");
      } else {
        setOut(json.invites as InviteResult[]);
        setRawEmails("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      setFormErr(msg || "Network error.");
    } finally {
      setSending(false);
      btnRef.current?.blur();
    }
  }

  // Continue button handler: managers/admins → employer view, others → normal
  const handleContinue = () => {
    // manager + verified
    // Your employer home can key off this query param
    const url ="/employerhomepage";
    router.push(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      <section>
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-semibold">Team</h1>
          <div className="text-sm text-neutral-500">
            {loadingMembers ? "Loading…" : `${members.length} member${members.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="mt-4 rounded-lg border">
          {loadingMembers && <div className="p-4 text-sm text-neutral-600">Loading team…</div>}
          {!loadingMembers && membersErr && <div className="p-4 text-sm text-red-600">{membersErr}</div>}
          {!loadingMembers && !membersErr && members.length === 0 && (
            <div className="p-4 text-sm text-neutral-600">No members yet.</div>
          )}
          {!loadingMembers && !membersErr && members.length > 0 && (
            <ul className="divide-y">
              {members.map((m) => (
                <li key={m.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-mono truncate">{m.email}</div>
                  </div>
                  <div className="ml-4 shrink-0 text-sm text-neutral-600">{m.role ?? "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Invite members</h2>

        {canInvite === false && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">{authzMsg}</div>
        )}

        <form onSubmit={sendInvites} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Emails</label>
            <textarea
              className={cx("w-full rounded-md border p-2 h-28", formErr && !emails.length && "border-red-500")}
              placeholder="one@company.com, two@company.com"
              value={rawEmails}
              onChange={(e) => setRawEmails(e.target.value)}
              disabled={canInvite === false}
            />
            {emails.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {emails.map((e) => (
                  <span key={e} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-neutral-50">
                    {e}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Role (optional)</label>
              <select
                className="w-full rounded-md border p-2"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={roles.length === 0}
              >
                <option value="">— None —</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location (optional)</label>
              <select
                className="w-full rounded-md border p-2"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={locs.length === 0}
              >
                <option value="">— None —</option>
                {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={isManager} onChange={(e) => setIsManager(e.target.checked)} />
              Manager
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
              Admin
            </label>
          </div>

          {formErr && <div className="text-sm text-red-600">{formErr}</div>}

          <div className="flex items-center gap-3">
            <button
              ref={btnRef}
              type="submit"
              disabled={sending || canInvite === false}
              className={cx(
                "rounded-md px-4 py-2 text-white",
                sending ? "bg-neutral-700" : "bg-black hover:bg-neutral-800",
                "disabled:opacity-60"
              )}
            >
              {sending ? "Sending…" : "Send invites"}
            </button>

            {/* Continue button */}
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Continue
            </button>

            {emails.length > 0 && <div className="text-xs text-neutral-600">{emails.length} to send</div>}
          </div>
        </form>

        {out.length > 0 && (
          <div className="mt-6">
            <div className="text-sm text-neutral-600 mb-2">Invites</div>
            <div className="rounded-lg border divide-y">
              {out.map(({ email, emailed, error }) => (
                <div key={email} className="p-3 flex items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-sm">{email}</div>
                    <div className={cx("text-xs", emailed ? "text-green-700" : "text-red-700")}>
                      {emailed ? "Email sent" : `Email not sent: ${error ?? "unknown error"}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ml-auto shrink-0 rounded border px-2 py-1 text-xs hover:bg-neutral-50"
                    onClick={async () => { try { await navigator.clipboard.writeText(email); } catch {} }}
                  >
                    Copy email
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

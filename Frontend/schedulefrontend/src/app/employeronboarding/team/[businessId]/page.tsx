"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Member = { id: string; email: string; role: string | null };
type OutLink = { email: string; joinUrl: string };

export default function TeamPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const supabase = createClientComponentClient();

  // Members list
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("employment")
        .select("user:profiles(id,email), role:role(name)")
        .eq("business_id", businessId as string)
        .eq("status", "active");
      if (!alive) return;
      setMembers(
        (data ?? []).map((r: any) => ({
          id: r.user.id,
          email: r.user.email,
          role: r.role?.name ?? null,
        }))
      );
    })();
    return () => { alive = false; };
  }, [businessId, supabase]);

  // Invite form (same logic as before)
  const [emails, setEmails] = useState("");
  const [roleId, setRoleId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [out, setOut] = useState<OutLink[]>([]);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  function parseEmails(raw: string) {
    return raw.split(/[\s,;]+/).map(s=>s.trim().toLowerCase()).filter(Boolean)
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }

  async function sendInvites(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const list = parseEmails(emails);
    if (!list.length) { setErr("Enter at least one valid email."); return; }
    setSending(true);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessId,
        invites: list.map(email => ({
          email,
          roleId: roleId || undefined,
          locationId: locationId || undefined,
          isManager,
          isAdmin,
        })),
      }),
    });
    const json = await res.json();
    setSending(false);
    if (!res.ok) { setErr(json.error ?? "Failed to create invites."); return; }
    setOut(json.invites as OutLink[]);
    setEmails("");
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Team</h1>
        <ul className="mt-3 divide-y">
          {members.map(m => (
            <li key={m.id} className="py-2 flex justify-between">
              <span className="font-mono">{m.email}</span>
              <span className="text-sm text-neutral-600">{m.role ?? "—"}</span>
            </li>
          ))}
          {members.length === 0 && <div className="text-sm text-neutral-600">No members yet.</div>}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Invite members</h2>
        <form onSubmit={sendInvites} className="mt-3 space-y-3">
          <textarea
            className="w-full border rounded p-2 h-28"
            placeholder="one@company.com, two@company.com"
            value={emails}
            onChange={e=>setEmails(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded p-2" placeholder="Role ID (optional)" value={roleId} onChange={e=>setRoleId(e.target.value)} />
            <input className="border rounded p-2" placeholder="Location ID (optional)" value={locationId} onChange={e=>setLocationId(e.target.value)} />
          </div>
          <label className="mr-4 text-sm"><input type="checkbox" checked={isManager} onChange={e=>setIsManager(e.target.checked)} /> Manager</label>
          <label className="text-sm"><input type="checkbox" checked={isAdmin} onChange={e=>setIsAdmin(e.target.checked)} /> Admin</label>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button type="submit" className="rounded bg-black text-white px-4 py-2" disabled={sending}>
            {sending ? "Sending…" : "Send invites"}
          </button>
        </form>

        {out.length > 0 && (
          <div className="mt-4 space-y-1 text-sm">
            <div className="text-neutral-600">Invite links:</div>
            {out.map(x => (
              <div key={x.email}>
                <span className="font-mono">{x.email}</span> —{" "}
                <a className="underline" href={x.joinUrl} target="_blank" rel="noreferrer">{x.joinUrl}</a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

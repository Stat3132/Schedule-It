              "use client";

              import { useEffect, useMemo, useRef, useState } from "react";
              import { useParams, useRouter } from "next/navigation";
              import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

              type Member = { id: string; email: string; role: string | null };
              type RoleOpt = { id: string; name: string };
              type LocOpt = { id: string; name: string };

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
                  .split(/[,;\s]+/)
                  .map((v) => v.trim().toLowerCase())
                  .filter(Boolean)
                  .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
                const seen = new Set<string>();
                const out: string[] = [];
                for (const e of emails) {
                  if (!seen.has(e)) {
                    seen.add(e);
                    out.push(e);
                  }
                }
                return out;
              }

              export default function TeamPage() {
                const router = useRouter();
                const { businessId } = useParams<{ businessId: string }>();
                const supabase = createClientComponentClient();

                const [canInvite, setCanInvite] = useState<boolean | null>(null);
                const [authzMsg, setAuthzMsg] = useState("");

                useEffect(() => {
                  let alive = true;
                  (async () => {
                    const [{ data: mgr }, { data: ver }] = await Promise.all([
                      supabase.rpc("is_manager", { biz: String(businessId) }),
                      supabase.rpc("is_verified", { biz: String(businessId) }),
                    ]);
                    if (!alive) return;
                    const ok = Boolean(mgr) && Boolean(ver);
                    setCanInvite(ok);
                    setAuthzMsg(!mgr ? "Not authorized. Manager access required." : !ver ? "Business is not verified." : "");
                  })();
                  return () => {
                    alive = false;
                  };
                }, [businessId, supabase]);

                const [members, setMembers] = useState<Member[]>([]);
                const [loadingMembers, setLoadingMembers] = useState(true);
                const [membersErr, setMembersErr] = useState("");

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
                      const toUser = (value: unknown): { id: string; email: string } | null => {
                        const user = Array.isArray(value) ? value[0] : value;
                        if (user && typeof user === "object") {
                          const obj = user as Record<string, unknown>;
                          const id = obj.id;
                          const email = obj.email;
                          if ((typeof id === "string" || typeof id === "number") && typeof email === "string") {
                            return { id: String(id), email };
                          }
                        }
                        return null;
                      };
                      const toRole = (value: unknown): string | null => {
                        const role = Array.isArray(value) ? value[0] : value;
                        if (role && typeof role === "object") {
                          const obj = role as Record<string, unknown>;
                          const name = obj.name;
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
                  return () => {
                    alive = false;
                  };
                }, [businessId, supabase]);

                const [roles, setRoles] = useState<RoleOpt[]>([]);
                const [locs, setLocs] = useState<LocOpt[]>([]);

                useEffect(() => {
                  let alive = true;
                  (async () => {
                    const [{ data: roleRows }, { data: locRows }] = await Promise.all([
                      supabase.from("role").select("id,name").eq("business_id", String(businessId)).order("name"),
                      supabase.from("location").select("id,name").eq("business_id", String(businessId)).order("name"),
                    ]);
                    if (!alive) return;
                    if (roleRows) setRoles(roleRows as RoleOpt[]);
                    if (locRows) setLocs(locRows as LocOpt[]);
                  })();
                  return () => {
                    alive = false;
                  };
                }, [businessId, supabase]);

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

                const [ownerEnsured, setOwnerEnsured] = useState(false);
                const [ownerEnsuredError, setOwnerEnsuredError] = useState<string | null>(null);
                useEffect(() => {
                  let alive = true;
                  (async () => {
                    if (!businessId || ownerEnsured) return;
                    try {
                      const {
                        data: { session },
                      } = await supabase.auth.getSession();
                      if (!session?.user) return;
                      const uid = session.user.id;
                      const { data: biz, error: bizErr } = await supabase
                        .from("business")
                        .select("owner_user_id,verification_status")
                        .eq("id", String(businessId))
                        .maybeSingle();
                      if (bizErr || !biz) return;
                      if (String(biz.owner_user_id) !== uid) return;
                      if (String(biz.verification_status) !== "verified") return;

                      const { data: existingRole } = await supabase
                        .from("role")
                        .select("id")
                        .eq("business_id", businessId)
                        .eq("name", "Owner")
                        .maybeSingle();

                      let ownerRoleId = existingRole?.id;
                      if (!ownerRoleId) {
                        const { data: newRole, error: roleErr } = await supabase
                          .from("role")
                          .insert({ business_id: businessId, name: "Owner", color: "#111827" })
                          .select("id")
                          .single();
                        if (!roleErr && newRole) ownerRoleId = newRole.id;
                      }

                      const ownerEmployment = {
                        user_id: uid,
                        business_id: businessId,
                        location_id: null,
                        role_id: ownerRoleId ?? null,
                        status: "active",
                        is_manager: true,
                        is_admin: true,
                        permissions: {},
                      };

                      const { error: empErr } = await supabase.from("employment").upsert([ownerEmployment], { onConflict: "user_id,business_id" });
                      if (empErr) {
                        console.error("owner employment upsert", empErr);
                        if (alive) setOwnerEnsuredError(empErr.message ?? String(empErr));
                      } else if (alive) {
                        setOwnerEnsured(true);
                      }
                    } catch (error) {
                      console.error("ensure owner employment", error);
                    }
                  })();
                  return () => {
                    alive = false;
                  };
                }, [businessId, ownerEnsured, supabase]);

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
                        invites: emails.map((email) => ({
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

                const handleContinue = () => {
                  router.push("/employermanagement/employerhomepage");
                };

                return (
                  <div className="mx-auto max-w-6xl p-6">
                    <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Employer onboarding</p>
                        <h1 className="text-2xl font-semibold text-slate-900">Invite Your Team</h1>
                        <p className="text-sm text-slate-600">Review current members, then send invitations to managers and staff.</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-4 py-1 text-sm text-slate-600">
                        {loadingMembers ? "Loading team…" : `${members.length} member${members.length === 1 ? "" : "s"}`}
                      </div>
                    </header>

                    {ownerEnsuredError && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{ownerEnsuredError}</div>
                    )}

                    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
                      <aside className="space-y-4 lg:col-span-2">
                        <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                          <header className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                Team snapshot
                              </div>
                              <h2 className="text-lg font-semibold text-slate-900">Active members</h2>
                              <p className="text-xs text-slate-600">Keep tabs on who already has access before adding more people.</p>
                            </div>
                          </header>
                          <div className="mt-4 min-h-[160px] rounded-xl border border-slate-100 bg-slate-50/70">
                            {loadingMembers ? (
                              <div className="flex h-40 items-center justify-center text-xs text-slate-500">Loading team…</div>
                            ) : membersErr ? (
                              <div className="p-4 text-sm text-red-600">{membersErr}</div>
                            ) : members.length === 0 ? (
                              <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
                                <p className="font-medium">No members yet.</p>
                                <p>Use the invite form to bring your first teammates onboard.</p>
                              </div>
                            ) : (
                              <ul className="divide-y divide-slate-200">
                                {members.slice(0, 8).map((member) => (
                                  <li key={member.id} className="flex items-center justify-between px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-mono text-sm text-slate-900">{member.email}</p>
                                      <p className="text-xs text-slate-500">{member.role ?? "No role assigned"}</p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                          <header className="flex items-center justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-slate-500">Invite context</p>
                              <h3 className="text-lg font-semibold text-slate-900">Roles & Locations</h3>
                            </div>
                            <div className="text-xs text-slate-500">Live counts</div>
                          </header>
                          <div className="mt-4 space-y-3 text-sm">
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                              <p className="text-xs text-slate-500">Roles available</p>
                              <p className="text-lg font-semibold text-slate-900">{roles.length}</p>
                              <p className="text-xs text-slate-500">{roles.length ? "Assign during invite" : "Add roles from the previous step."}</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                              <p className="text-xs text-slate-500">Locations available</p>
                              <p className="text-lg font-semibold text-slate-900">{locs.length}</p>
                              <p className="text-xs text-slate-500">{locs.length ? "Optional but helpful for scheduling." : "Add locations to better target invites."}</p>
                            </div>
                          </div>
                        </section>
                      </aside>

                      <div className="space-y-6 lg:col-span-3">
                        <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                          <header className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <h2 className="text-xl font-semibold text-slate-900">Invite team members</h2>
                              <p className="text-sm text-slate-600">Paste email addresses, optionally preselect a role or location, and choose access level.</p>
                            </div>
                            {canInvite === false && (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">Authorization required</span>
                            )}
                          </header>

                          {canInvite === false && (
                            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{authzMsg}</div>
                          )}

                          <form onSubmit={sendInvites} className="space-y-5">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-slate-800">Emails</label>
                              <textarea
                                className={cx(
                                  "w-full rounded-lg border px-3 py-2 text-sm",
                                  formErr && !emails.length && "border-red-400"
                                )}
                                placeholder="one@company.com, two@company.com"
                                value={rawEmails}
                                onChange={(e) => setRawEmails(e.target.value)}
                                disabled={canInvite === false}
                                rows={4}
                              />
                              {emails.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {emails.map((email) => (
                                    <span
                                      key={email}
                                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                                    >
                                      {email}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <label className="text-sm">
                                <span className="mb-1 block font-medium text-slate-800">Role (optional)</span>
                                <select
                                  className="w-full rounded-lg border px-3 py-2"
                                  value={roleId}
                                  onChange={(e) => setRoleId(e.target.value)}
                                  disabled={roles.length === 0}
                                >
                                  <option value="">— None —</option>
                                  {roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                      {role.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="text-sm">
                                <span className="mb-1 block font-medium text-slate-800">Location (optional)</span>
                                <select
                                  className="w-full rounded-lg border px-3 py-2"
                                  value={locationId}
                                  onChange={(e) => setLocationId(e.target.value)}
                                  disabled={locs.length === 0}
                                >
                                  <option value="">— None —</option>
                                  {locs.map((loc) => (
                                    <option key={loc.id} value={loc.id}>
                                      {loc.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <div className="flex flex-wrap gap-6 text-sm text-slate-700">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300"
                                  checked={isManager}
                                  onChange={(e) => setIsManager(e.target.checked)}
                                />
                                Manager access
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300"
                                  checked={isAdmin}
                                  onChange={(e) => setIsAdmin(e.target.checked)}
                                />
                                Admin access
                              </label>
                            </div>

                            {formErr && <div className="text-sm text-red-600">{formErr}</div>}

                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                ref={btnRef}
                                type="submit"
                                disabled={sending || canInvite === false}
                                className={cx(
                                  "rounded-md px-4 py-2 text-sm font-semibold text-white",
                                  sending ? "bg-slate-500" : "bg-blue-600 hover:bg-blue-700",
                                  "disabled:opacity-60"
                                )}
                              >
                                {sending ? "Sending…" : "Send invites"}
                              </button>
                              {emails.length > 0 && (
                                <div className="text-xs text-slate-500">{emails.length} recipient{emails.length > 1 ? "s" : ""}</div>
                              )}
                            </div>
                          </form>
                        </section>

                        {out.length > 0 && (
                          <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900">Invite results</h3>
                            <p className="text-sm text-slate-600">Copy emails or check delivery status after each send.</p>
                            <div className="mt-4 divide-y rounded-xl border border-slate-100">
                              {out.map(({ email, emailed, error }) => (
                                <div key={email} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-mono text-sm text-slate-900">{email}</p>
                                    <p className={cx("text-xs", emailed ? "text-green-700" : "text-red-600")}>
                                      {emailed ? "Email sent" : `Email not sent: ${error ?? "unknown"}`}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(email);
                                      } catch {
                                        /* clipboard unavailable */
                                      }
                                    }}
                                  >
                                    Copy email
                                  </button>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => router.push(`/employeronboarding/locationandroleinfo/${businessId}`)}
                          >
                            Back to locations & roles
                          </button>
                          <button type="button" onClick={handleContinue} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                            Continue to dashboard
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
// removed duplicate UI that was accidentally placed outside the TeamPage component

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Building2, CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Business = { id: string; name: string; timezone: string; created_at: string };
type Location = { id: string; name: string; address?: string | null };

export default function BusinessSelectionPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <BusinessSelectionInner />
    </Suspense>
  );
}

function BusinessSelectionInner() {
  const supabase = createClientComponentClient();
  const params = useSearchParams();
  const router = useRouter();

  const token = params.get("token") ?? "";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Business[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);

  // server-side status for the selected business and current user
  const [isMgr, setIsMgr] = useState<boolean | null>(null);
  const [isEmp, setIsEmp] = useState<boolean | null>(null);
  const [isBizVerified, setIsBizVerified] = useState<boolean | null>(null);

  const [inviteBiz, setInviteBiz] = useState<{ id: string; name: string } | null>(null);
  const [bannerErr, setBannerErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If token is present, prefill business name
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("get_invite_target", { p_token: token });
      if (!alive) return;
      if (error) { setBannerErr(error.message); return; }
      const row = (data as { business_id: string; business_name: string }[] | null)?.[0];
      if (!row) return;
      setInviteBiz({ id: row.business_id, name: row.business_name });
      setSearchQuery(row.business_name);
    })();
    return () => { alive = false; };
  }, [token, supabase]);

  // Debounced business search
  useEffect(() => {
    if (selectedBusiness) return; // stop searching after choose
    let alive = true;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }

    const t = window.setTimeout(async () => {
      setIsSearching(true);
      const { data, error } = await supabase
        .from("business")
        .select("id,name,timezone,created_at")
        .ilike("name", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!alive) return;
      setIsSearching(false);
      if (error) { setSearchResults([]); return; }
      setSearchResults((data ?? []) as Business[]);
    }, 200);

    return () => { alive = false; window.clearTimeout(t); };
  }, [searchQuery, supabase, selectedBusiness]);

  // After selecting a business: load locations and compute permissions
  useEffect(() => {
    let alive = true;
    setLocations([]); setSelectedLocIds([]); setIsMgr(null); setIsEmp(null); setIsBizVerified(null);
    if (!selectedBusiness) return;

    (async () => {
      setLocLoading(true);
      const [{ data: locs, error: locErr }, mgr, emp, ver] = await Promise.all([
        supabase.from("location").select("id,name,address").eq("business_id", selectedBusiness.id).order("name", { ascending: true }),
        supabase.rpc("is_manager", { biz: selectedBusiness.id }),
        supabase.rpc("is_employee", { biz: selectedBusiness.id }),
        supabase.rpc("is_verified", { biz: selectedBusiness.id }),
      ]);
      if (!alive) return;

      setLocLoading(false);
      if (!locErr && locs) setLocations(locs as Location[]);
      setIsMgr(Boolean((mgr.data as boolean) ?? false));
      setIsEmp(Boolean((emp.data as boolean) ?? false));
      setIsBizVerified(Boolean((ver.data as boolean) ?? false));
    })();

    return () => { alive = false; };
  }, [selectedBusiness, supabase]);

  function handleBusinessSelect(b: Business) {
    setSelectedBusiness(b);
    setSearchQuery(b.name);
    setSearchResults([]);
  }

  function toggleLoc(id: string) {
    setSelectedLocIds(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  }

  async function acceptInviteNow() {
    setSubmitting(true);
    setBannerErr("");
    const { error } = await supabase.rpc("accept_employee_invite", { p_token: token });
    if (error) { setSubmitting(false); setBannerErr(error.message); return; }
    router.replace("/homepage");
  }

  // Only managers of verified businesses may upsert employment by RLS
  async function upsertEmploymentForSelf(businessId: string, locationId: string) {
    // check again server-side and let the DB enforce anyway
    const { error: insErr } = await supabase.from("employment").insert({
      // user_id resolved from auth.uid() only by RLS; here we must pass it
      // client must send the explicit FK:
      user_id: (await supabase.auth.getUser()).data.user?.id,
      business_id: businessId,
      location_id: locationId,
      role_id: null,
      status: "active",
      is_manager: false,
      is_admin: false,
      permissions: {},
    });
    if (insErr) throw new Error(insErr.message);
  }

  async function handleContinue() {
    if (!selectedBusiness || selectedLocIds.length === 0) return;
    setSubmitting(true);
    setBannerErr("");

    try {
      // 1) Invite flow takes precedence
      if (token) {
        await acceptInviteNow();
        return;
      }

      // 2) If already an employee, do not write. Just store hint and go.
      if (isEmp) {
        try {
          localStorage.setItem("activeBusinessId", selectedBusiness.id);
          localStorage.setItem("activeBusinessName", selectedBusiness.name);
          localStorage.setItem("activeLocationIds", JSON.stringify(selectedLocIds));
        } catch {}
        router.push("/homepage");
        return;
      }

      // 3) If not an employee: only allow manager of a verified business to self-add.
      if (isMgr && isBizVerified) {
        await upsertEmploymentForSelf(selectedBusiness.id, selectedLocIds[0]);
        try {
          localStorage.setItem("activeBusinessId", selectedBusiness.id);
          localStorage.setItem("activeBusinessName", selectedBusiness.name);
          localStorage.setItem("activeLocationIds", JSON.stringify(selectedLocIds));
        } catch {}
        router.push("/homepage");
        return;
      }

      // 4) Otherwise blocked by RLS. Require an invite.
      setBannerErr(
        "You are not a manager of a verified business. Ask a manager to send you an invite link, or sign in with a manager account."
      );
      setSubmitting(false);
    } catch (e) {
      setBannerErr(e instanceof Error ? e.message : "Failed to save selection");
      setSubmitting(false);
    }
  }

  const canContinue =
    !!selectedBusiness &&
    selectedLocIds.length > 0 &&
    !submitting;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {inviteBiz && (
          <div className="mb-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900">
                  You were invited to join <span className="underline">{inviteBiz.name}</span>.
                </p>
                <p className="text-sm text-blue-700 mt-1">Click “Join business” to accept.</p>
              </div>
              <button
                disabled={submitting}
                onClick={acceptInviteNow}
                className="px-3 py-1 border rounded bg-blue-600 text-white disabled:opacity-60"
              >
                Join business
              </button>
            </div>
            {bannerErr && <div className="text-red-600 text-sm mt-2">{bannerErr}</div>}
          </div>
        )}

        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-primary px-8 py-10">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                <Building2 className="w-10 h-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-primary-foreground text-center">Find Your Business</h1>
            <p className="text-primary-foreground/80 text-center mt-2">Search for your registered corporation</p>
          </div>

          <div className="px-8 py-10">
            <div className="relative">
              <label htmlFor="businessSearch" className="block text-sm font-semibold mb-2">Business Name</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="businessSearch"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedBusiness(null); }}
                  className="w-full pl-12 pr-4 py-3 border rounded-lg"
                  placeholder="Start typing to search..."
                  autoComplete="off"
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-background border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handleBusinessSelect(b)}
                      className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-b-0 flex items-start gap-3"
                    >
                      <Building2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{b.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{b.timezone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!selectedBusiness && searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Business not found</p>
                    <p className="text-sm text-destructive/80 mt-1">No registered businesses match {searchQuery}</p>
                  </div>
                </div>
              )}

              {selectedBusiness && (
                <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-green-900 text-lg">Business Found</p>
                      <p className="text-green-700 mt-1">{selectedBusiness.name}</p>
                      <p className="text-sm text-green-600 mt-1">{selectedBusiness.timezone}</p>
                      <p className="text-xs text-green-600 mt-2">
                        Registered: {new Date(selectedBusiness.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <ShieldCheck className={`w-4 h-4 ${isBizVerified ? "text-green-600" : "text-gray-400"}`} />
                        <span>{isBizVerified ? "Business verified" : "Business not verified"}</span>
                      </div>
                      {(isMgr === true || isEmp === true) && (
                        <p className="text-xs text-green-700 mt-1">
                          {isMgr ? "You are a manager of this business." : "You are an employee of this business."}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Select one location</h3>
                    <div className="border rounded-lg divide-y">
                      {locLoading ? (
                        <div className="p-3 text-sm text-muted-foreground">Loading locations…</div>
                      ) : locations.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No locations for this business.</div>
                      ) : (
                        locations.map((loc) => {
                          const checked = selectedLocIds.includes(loc.id);
                          return (
                            <label key={loc.id} className="flex items-center gap-3 p-3 cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={checked}
                                onChange={() => toggleLoc(loc.id)}
                              />
                              <div className="flex-1">
                                <div className="font-medium">{loc.name}</div>
                                {loc.address && <div className="text-xs text-muted-foreground">{loc.address}</div>}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    {selectedLocIds.length > 1 && (
                      <p className="text-xs text-amber-700 mt-2">
                        Only one location is stored on your employment. The first checked will be saved.
                      </p>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      className="px-4 py-2 rounded-lg border"
                      onClick={() => { setSelectedBusiness(null); setSearchResults([]); setLocations([]); setSelectedLocIds([]); }}
                      disabled={submitting}
                    >
                      Change business
                    </button>
                    <button
                      className={`px-4 py-2 rounded-lg border ${!canContinue
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-primary text-primary-foreground"
                      }`}
                      disabled={!canContinue}
                      onClick={handleContinue}
                    >
                      {submitting ? "Saving…" : "Continue"}
                    </button>
                  </div>

                  {(!isMgr && !isEmp && !token) && (
                    <p className="text-sm text-amber-700 mt-3">
                      Not an employee yet. Ask a manager for an invite link to join this business.
                    </p>
                  )}

                  {bannerErr && <div className="text-red-600 text-sm mt-3">{bannerErr}</div>}
                </div>
              )}
            </div>

            {searchQuery.length === 0 && (
              <div className="mt-8 text-center text-muted-foreground">
                <p className="text-sm">Start typing to search for a registered business</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

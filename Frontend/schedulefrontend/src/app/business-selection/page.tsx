"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Search,
  Building2,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Send,
} from "lucide-react";

type UUID = string;

type Business = {
  id: UUID;
  name: string;
  timezone: string;
  created_at: string;
};

type Location = {
  id: UUID;
  name: string;
  address?: string | null;
};

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

  // ---------- State ----------
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Business[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
    null
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedLocId, setSelectedLocId] = useState<string>("");
  const [isMgr, setIsMgr] = useState<boolean | null>(null);
  const [isEmp, setIsEmp] = useState<boolean | null>(null);
  const [isBizVerified, setIsBizVerified] = useState<boolean | null>(null);
  const [inviteBiz, setInviteBiz] = useState<{ id: string; name: string } | null>(
    null
  );
  const [bannerErr, setBannerErr] = useState("");
  const [bannerOk, setBannerOk] = useState("");
  const [lastRpcResult, setLastRpcResult] = useState<unknown>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const EMPLOYEE_HOME = "/employeemanagement/employeehomepage";
  const EMPLOYER_HOME = "/employermanagement/employerhomepage";

  // ---------- Invite Prefill ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("get_invite_target", {
        p_token: token,
      });
      if (!alive) return;
      if (error) {
        setBannerErr(error.message);
        return;
      }
      const row =
        (data as { business_id: string; business_name: string }[] | null)?.[0];
      if (!row) return;
      setInviteBiz({ id: row.business_id, name: row.business_name });
      setSearchQuery(row.business_name);
    })();
    return () => {
      alive = false;
    };
  }, [token, supabase]);

  // ---------- Business Search ----------
  useEffect(() => {
    if (selectedBusiness) return;
    let alive = true;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const t = window.setTimeout(async () => {
      setIsSearching(true);
      const { data, error } = await supabase
        .from("business_search_v")
        .select("id,name,timezone,created_at")
        .ilike("name", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!alive) return;
      setIsSearching(false);
      if (error) {
        console.error("business search error", error);
        setSearchResults([]);
        return;
      }
      setSearchResults((data ?? []) as Business[]);
    }, 200);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [searchQuery, supabase, selectedBusiness]);

  // ---------- Load Locations + Flags ----------
  useEffect(() => {
    let alive = true;

    // reset when business changes
    setLocations([]);
    setIsMgr(null);
    setIsEmp(null);
    setIsBizVerified(null);
    setBannerErr("");
    setBannerOk("");

    if (!selectedBusiness) return;

    (async () => {
      setLocLoading(true);

      const normalizeRpcBool = (val: unknown) => {
        if (val == null) return false;
        if (typeof val === "boolean") return val;
        if (Array.isArray(val) && val.length > 0) {
          const first = val[0];
          if (typeof first === "boolean") return first;
          if (typeof first === "object" && first !== null) {
            for (const v of Object.values(first as Record<string, unknown>)) {
              if (typeof v === "boolean") return v;
            }
          }
        }
        if (typeof val === "object" && val !== null) {
          for (const v of Object.values(val as Record<string, unknown>)) {
            if (typeof v === "boolean") return v as boolean;
          }
        }
        return false;
      };

      try {
        const [{ data: locs, error: locErr }, mgr, emp, ver] = await Promise.all(
          [
            supabase
              .from("location")
              .select("id,name,address")
              .eq("business_id", selectedBusiness.id)
              .order("name", { ascending: true }),
            supabase.rpc("is_manager", { biz: selectedBusiness.id }),
            supabase.rpc("is_employee", { biz: selectedBusiness.id }),
            supabase.rpc("is_verified", { biz: selectedBusiness.id }),
          ]
        );

        if (!alive) return;

        console.log("loadLocations result", {
          businessId: selectedBusiness.id,
          locs,
          locErr,
          mgr: mgr?.data,
          emp: emp?.data,
          ver: ver?.data,
        });

        setLocLoading(false);
        if (!locErr && locs) setLocations(locs as Location[]);

        setIsMgr(Boolean(normalizeRpcBool(mgr?.data)));
        setIsEmp(Boolean(normalizeRpcBool(emp?.data)));
        setIsBizVerified(Boolean(normalizeRpcBool(ver?.data)));
      } catch (e) {
        console.error("loadLocations error", e);
        setLocLoading(false);
        setBannerErr(
          e instanceof Error ? e.message : "Failed to load business info"
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedBusiness, supabase]); // <- removed selectedLocId here

  // ---------- Actions ----------
  function handleBusinessSelect(b: Business) {
    setSelectedBusiness(b);
    setSelectedLocId("");      // clear previous location when business changes
    setSearchQuery(b.name);
    setSearchResults([]);
  }

  async function acceptInviteNow() {
    setSubmitting(true);
    setBannerErr("");
    const { error } = await supabase.rpc("accept_employee_invite", {
      p_token: token,
    });
    if (error) {
      setSubmitting(false);
      setBannerErr(error.message);
      return;
    }
    router.replace(EMPLOYEE_HOME);
  }

  async function upsertEmploymentForSelf(
    businessId: string,
    locationId: string
  ) {
    const { data: auth } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from("employment").insert({
      user_id: auth.user?.id,
      business_id: businessId,
      location_id: locationId || null,
      role_id: null,
      status: "active",
      is_manager: false,
      is_admin: false,
      permissions: {},
    });
    if (insErr) throw new Error(insErr.message);
  }

  async function requestJoin(): Promise<string | null> {
    if (!selectedBusiness) return null;
    setSubmitting(true);
    setBannerErr("");
    setBannerOk("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user?.id) {
        setBannerErr("Sign in required before sending a request.");
        return null;
      }

      const params = {
        p_business: selectedBusiness.id,
        p_location: selectedLocId || null,
        p_role: null,
        p_message: null,
      };

      console.log("calling create_join_request", params);
      setLastAction("calling create_join_request");

      const { data, error } = await supabase.rpc(
        "create_join_request",
        params as any
      );

      console.log("create_join_request result", { data, error });
      setLastAction("create_join_request result");
      setLastRpcResult({ data, error });

      if (error) {
        const msg = error.message ?? JSON.stringify(error);
        setBannerErr(`Failed to send join request: ${msg}`);
        throw error;
      }

      const extractId = (val: unknown): string | null => {
        if (!val) return null;
        if (typeof val === "string") return val;
        if (Array.isArray(val)) {
          if (val.length === 0) return null;
          const first = val[0];
          if (typeof first === "string") return first;
          if (typeof first === "object" && first !== null) {
            if ("id" in (first as any)) return String((first as any).id);
            const v = Object.values(first as Record<string, unknown>)[0];
            if (typeof v === "string") return v;
          }
          return null;
        }
        if (typeof val === "object" && val !== null) {
          if ("id" in (val as any)) return String((val as any).id);
          const v = Object.values(val as Record<string, unknown>)[0];
          if (typeof v === "string") return v;
        }
        return null;
      };

      const requestId = extractId(data);

      if (!requestId) {
        setBannerErr(
          "Join request did not return an id. Check the RPC implementation and server logs."
        );
        return null;
      }

      setBannerOk("Request sent to the business managers.");
      setLastAction(`request succeeded, id=${requestId}`);
      return requestId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setBannerErr(msg ?? "Failed to send request");
      console.error("create_join_request error:", e);
      setLastAction("create_join_request error");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinue() {
    if (!selectedBusiness || !selectedLocId) return;
    setSubmitting(true);
    setBannerErr("");
    setBannerOk("");

    try {
      if (token) {
        await acceptInviteNow();
        return;
      }

      if (isEmp) {
        localStorage.setItem("activeBusinessId", selectedBusiness.id);
        localStorage.setItem("activeBusinessName", selectedBusiness.name);
        localStorage.setItem(
          "activeLocationIds",
          JSON.stringify([selectedLocId])
        );
        setLastAction("navigating to employeehomepage (isEmp)");
        router.replace(EMPLOYEE_HOME);
        return;
      }

      if (isMgr && isBizVerified) {
        await upsertEmploymentForSelf(selectedBusiness.id, selectedLocId);
        localStorage.setItem("activeBusinessId", selectedBusiness.id);
        localStorage.setItem("activeBusinessName", selectedBusiness.name);
        localStorage.setItem(
          "activeLocationIds",
          JSON.stringify([selectedLocId])
        );
        setLastAction(
          "upsertEmploymentForSelf -> navigating to employerhomepage"
        );
        router.replace(EMPLOYER_HOME);
        return;
      }

      const reqId = await requestJoin();
      if (reqId) {
        setLastAction(`join request created, id=${reqId} -> employeehomepage`);
        router.replace(EMPLOYEE_HOME);
      } else {
        setSubmitting(false);
      }
    } catch (e) {
      setBannerErr(
        e instanceof Error ? e.message : "Failed to save selection"
      );
      setSubmitting(false);
    }
  }

  // ---------- Derived ----------
  const canContinue = Boolean(selectedBusiness && selectedLocId && !submitting);
  const showRequestBtn = useMemo(
    () => !isMgr && !isEmp && !token,
    [isMgr, isEmp, token]
  );
  const willCreateRequest = !token && !isEmp && !(isMgr && isBizVerified);
  const primaryLabel = submitting
    ? "Saving…"
    : willCreateRequest
    ? "Request to join"
    : "Continue";

  // ---------- Render ----------
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {inviteBiz && (
          <div className="mb-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900">
                  You were invited to join{" "}
                  <span className="underline">{inviteBiz.name}</span>.
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Click “Join business” to accept.
                </p>
              </div>
              <button
                disabled={submitting}
                onClick={acceptInviteNow}
                className="px-3 py-1 border rounded bg-blue-600 text-white disabled:opacity-60"
              >
                Join business
              </button>
            </div>
            {bannerErr && (
              <div className="text-red-600 text-sm mt-2">{bannerErr}</div>
            )}
          </div>
        )}

        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="bg-primary px-8 py-10 text-center text-primary-foreground">
            <div className="flex justify-center mb-4">
              <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                <Building2 className="w-10 h-10" />
              </div>
            </div>
          <h1 className="text-3xl font-bold">Find Your Business</h1>
            <p className="text-primary-foreground/80 mt-2">
              Search for your registered corporation
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-10">
            <div className="relative">
              <label
                htmlFor="businessSearch"
                className="block text-sm font-semibold mb-2"
              >
                Business Name
              </label>

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="businessSearch"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedBusiness(null);
                    setSelectedLocId("");
                    setBannerErr("");
                    setBannerOk("");
                  }}
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

              {/* Search Results */}
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
                        <p className="text-sm text-muted-foreground truncate">
                          {b.timezone}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No Results */}
              {!selectedBusiness &&
                searchQuery.length >= 2 &&
                searchResults.length === 0 &&
                !isSearching && (
                  <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-semibold text-destructive">
                        Business not found
                      </p>
                      <p className="text-sm text-destructive/80 mt-1">
                        No registered businesses match {searchQuery}
                      </p>
                    </div>
                  </div>
                )}

              {/* Selected Business */}
              {selectedBusiness && (
                <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-green-900 text-lg">
                        Business Found
                      </p>
                      <p className="text-green-700 mt-1">
                        {selectedBusiness.name}
                      </p>
                      <p className="text-sm text-green-600 mt-1">
                        {selectedBusiness.timezone}
                      </p>
                      <p className="text-xs text-green-600 mt-2">
                        Registered:{" "}
                        {new Date(
                          selectedBusiness.created_at
                        ).toLocaleDateString()}
                      </p>

                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <ShieldCheck
                          className={`w-4 h-4 ${
                            isBizVerified ? "text-green-600" : "text-gray-400"
                          }`}
                        />
                        <span>
                          {isBizVerified
                            ? "Business verified"
                            : "Business not verified"}
                        </span>
                      </div>

                      {(isMgr || isEmp) && (
                        <p className="text-xs text-green-700 mt-1">
                          {isMgr
                            ? "You are a manager of this business."
                            : "You are an employee of this business."}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Locations */}
                  <div className="mt-4">
                    <h3 className="font-semibold mb-2">Select one location</h3>
                    <div className="border rounded-lg divide-y">
                      {locLoading ? (
                        <div className="p-3 text-sm text-muted-foreground">
                          Loading locations…
                        </div>
                      ) : locations.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">
                          No locations for this business.
                        </div>
                      ) : (
                        locations.map((loc) => (
                          <label
                            key={loc.id}
                            className="flex items-center gap-3 p-3 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="primary-location"
                              className="h-4 w-4"
                              checked={selectedLocId === loc.id}
                              onChange={() => setSelectedLocId(loc.id)}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{loc.name}</div>
                              {loc.address && (
                                <div className="text-xs text-muted-foreground">
                                  {loc.address}
                                </div>
                              )}
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    {showRequestBtn && (
                      <button
                        className="px-4 py-2 rounded-lg border inline-flex items-center gap-2"
                        onClick={async () => {
                          const reqId = await requestJoin();
                          if (reqId) {
                            setLastAction(
                              `join request (secondary button), id=${reqId} -> employeehomepage`
                            );
                            router.replace(EMPLOYEE_HOME);
                          }
                        }}
                        disabled={submitting}
                      >
                        <Send className="w-4 h-4" /> Request to join
                      </button>
                    )}
                    <button
                      className="px-4 py-2 rounded-lg border"
                      onClick={() => {
                        setSelectedBusiness(null);
                        setSearchResults([]);
                        setLocations([]);
                        setSelectedLocId("");
                      }}
                      disabled={submitting}
                    >
                      Change business
                    </button>
                    <button
                      className={`px-4 py-2 rounded-lg border ${
                        !canContinue
                          ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                          : "bg-primary text-primary-foreground"
                      }`}
                      disabled={!canContinue}
                      onClick={handleContinue}
                    >
                      {primaryLabel}
                    </button>
                  </div>

                  {bannerOk && (
                    <div className="text-green-700 text-sm mt-3">
                      {bannerOk}
                    </div>
                  )}
                  {bannerErr && (
                    <div className="text-red-600 text-sm mt-3">
                      {bannerErr}
                    </div>
                  )}
                  {lastRpcResult != null && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-xs">
                      {lastAction && (
                        <div className="text-xs text-muted-foreground mb-1">
                          Last action: {lastAction}
                        </div>
                      )}
                      <div className="font-semibold mb-1">
                        Debug: last RPC result
                      </div>
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(lastRpcResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {searchQuery.length === 0 && (
              <div className="mt-8 text-center text-muted-foreground">
                <p className="text-sm">
                  Start typing to search for a registered business
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Search,
  Building2,
  CheckCircle,
  XCircle,
  ShieldCheck,
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

type CreateJoinParams = {
  p_business: string;
  p_location?: string | null;
  p_role?: string | null;
  p_message?: string | null;
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
    if (token) {
      setBannerErr("Invited users must accept their invite to join this business.");
      setBannerOk("");
      return null;
    }
    setSubmitting(true);
    setBannerErr("");
    setBannerOk("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user?.id) {
        setBannerErr("Sign in required before sending a request.");
        return null;
      }

      const params: CreateJoinParams = {
        p_business: selectedBusiness.id,
        p_location: selectedLocId || null,
        p_role: null,
        p_message: null,
      };

      console.log("calling create_join_request", params);

      const { data, error } = await supabase.rpc(
        "create_join_request",
        params as CreateJoinParams
      );

      console.log("create_join_request result", { data, error });

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
            const obj = first as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(obj, "id")) {
              const id = obj["id"];
              if (typeof id === "string" || typeof id === "number") return String(id);
            }
            const v = Object.values(obj)[0];
            if (typeof v === "string") return v;
          }
          return null;
        }
        if (typeof val === "object" && val !== null) {
          const obj = val as Record<string, unknown>;
          if (Object.prototype.hasOwnProperty.call(obj, "id")) {
            const id = obj["id"];
            if (typeof id === "string" || typeof id === "number") return String(id);
          }
          const v = Object.values(obj)[0];
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
      return requestId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setBannerErr(msg ?? "Failed to send request");
      console.error("create_join_request error:", e);
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
        router.replace(EMPLOYER_HOME);
        return;
      }

      const reqId = await requestJoin();
      if (reqId) {
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
  const willCreateRequest = !token && !isEmp && !(isMgr && isBizVerified);
  const primaryLabel = submitting
    ? "Saving…"
    : willCreateRequest
    ? "Request to join"
    : "Continue";

  // ---------- Render ----------
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
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

        <div className="bg-card rounded-3xl shadow-2xl border border-border overflow-visible">
          {/* Header */}
          <div className="bg-primary px-6 py-8 text-center text-primary-foreground sm:px-8 sm:py-10">
            <div className="flex justify-center mb-5 sm:mb-6">
              <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-sm shadow-lg sm:p-4">
                <Building2 className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>
            </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Find Your Business</h1>
            <p className="text-primary-foreground/80 mt-2 text-base sm:mt-3 sm:text-lg">
              Search for your registered corporation
            </p>
          </div>

          {/* Body */}
          <div className="px-5 py-8 sm:px-8 sm:py-10">
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
                <div className="mt-3 w-full bg-background border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handleBusinessSelect(b)}
                      className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-b-0 flex items-start gap-3"
                    >
                      <Building2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold break-words leading-snug">
                          {b.name}
                        </p>
                        <p className="text-sm text-muted-foreground break-words">
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
                <div className="mt-6 rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 via-white to-green-100/60 p-5 shadow-lg sm:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="shrink-0 rounded-2xl bg-green-100 p-4">
                          <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-2xl font-semibold text-green-900">
                            {selectedBusiness.name}
                          </p>
                          <p className="text-base text-green-700">
                            {selectedBusiness.timezone}
                          </p>
                          <p className="text-sm text-green-600">
                            Registered on {" "}
                            {new Date(
                              selectedBusiness.created_at
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-base">
                        <ShieldCheck
                          className={`w-5 h-5 ${
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
                        <p className="text-sm text-green-700">
                          {isMgr
                            ? "You are a manager of this business."
                            : "You are an employee of this business."}
                        </p>
                      )}

                      <div className="rounded-2xl border border-green-200 bg-white/60 p-4 sm:p-5">
                        <h3 className="text-lg font-semibold mb-3">
                          Select one location
                        </h3>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-1 sm:max-h-72">
                          {locLoading ? (
                            <div className="text-sm text-muted-foreground">
                              Loading locations…
                            </div>
                          ) : locations.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              No locations for this business.
                            </div>
                          ) : (
                            locations.map((loc) => (
                              <label
                                key={loc.id}
                                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition shadow-sm ${
                                  selectedLocId === loc.id
                                    ? "border-green-500 bg-green-50"
                                    : "border-border bg-white"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="primary-location"
                                  className="mt-1 h-4 w-4"
                                  checked={selectedLocId === loc.id}
                                  onChange={() => setSelectedLocId(loc.id)}
                                />
                                <div className="flex-1">
                                  <div className="text-base font-medium">
                                    {loc.name}
                                  </div>
                                  {loc.address && (
                                    <div className="text-sm text-muted-foreground">
                                      {loc.address}
                                    </div>
                                  )}
                                </div>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:max-w-sm rounded-2xl border border-green-200 bg-white p-5 shadow-md space-y-4">
                      <h3 className="text-lg font-semibold">Next steps</h3>
                      <p className="text-sm text-muted-foreground">
                        Confirm your selection or request access from the business managers.
                      </p>
                      <div className="flex flex-col gap-3">
                        <button
                          className="w-full px-4 py-2 rounded-xl border"
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
                          className={`w-full px-4 py-2 rounded-xl border text-base font-semibold ${
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
                        <div className="text-green-700 text-sm">{bannerOk}</div>
                      )}
                      {bannerErr && (
                        <div className="text-red-600 text-sm">{bannerErr}</div>
                      )}
                    </div>
                  </div>
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

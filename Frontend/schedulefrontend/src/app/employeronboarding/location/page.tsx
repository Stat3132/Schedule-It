// app/locations/add/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Biz = { id: string; name: string; verification_status: "unverified"|"docs_submitted"|"verified"|"rejected" };
type Emp = { id: string; is_manager: boolean; is_admin: boolean; status: "invited"|"active"|"inactive"|"terminated"; business: Biz };

type Draft = {
  business_id: string;
  name: string;
  address: string;
  tz_override: string;
  busy?: boolean;
  ok?: boolean;
  err?: string | null;
};

export default function AddLocationsPage() {
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [managerEmployments, setManagerEmployments] = useState<Emp[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // load employments where user is manager/admin; include business to check verified
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data, error } = await supabase
        .from("employment")
        .select("id,is_manager,is_admin,status,business:business_id(id,name,verification_status)")
        .eq("status","active");

      if (!alive) return;
if (error) {
  console.error(error);
  setManagerEmployments([]);
} else {
  // Supabase can return the joined "business" as an array; normalize to a single object to satisfy our Biz type
  const mgrsRaw = (data ?? []).filter((e: any) => {
    const verification = Array.isArray(e.business) ? e.business[0]?.verification_status : e.business?.verification_status;
    return (e.is_admin || e.is_manager) && verification === "verified";
  });

  const mgrs = mgrsRaw.map((e: any) => ({
    id: e.id,
    is_manager: e.is_manager,
    is_admin: e.is_admin,
    status: e.status,
    business: Array.isArray(e.business) ? e.business[0] : e.business,
  }));

  setManagerEmployments(mgrs);
  // seed first draft if at least one business
  if (mgrs.length && drafts.length === 0) {
    setDrafts([{ business_id: mgrs[0].business.id, name: "", address: "", tz_override: "" }]);
  }
}
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line

  const bizOptions = useMemo(() => managerEmployments.map(e => e.business), [managerEmployments]);

  const addDraft = () => {
    setDrafts(d => [...d, { business_id: bizOptions[0]?.id || "", name: "", address: "", tz_override: "" }]);
  };

  const updateDraft = (i: number, patch: Partial<Draft>) => {
    setDrafts(d => d.map((row, idx) => idx === i ? { ...row, ...patch, ok: undefined, err: undefined } : row));
  };

  const removeDraft = (i: number) => {
    setDrafts(d => d.filter((_, idx) => idx !== i));
  };

  const submitOne = async (i: number) => {
    const draft = drafts[i];
    if (!draft.business_id || !draft.name.trim()) {
      updateDraft(i, { err: "Business and name are required." });
      return;
    }
    updateDraft(i, { busy: true, err: null });
    const { error } = await supabase.from("location").insert({
      business_id: draft.business_id,
      name: draft.name.trim(),
      address: draft.address?.trim() || null,
      tz_override: draft.tz_override?.trim() || null,
    });
    if (error) {
      updateDraft(i, { busy: false, err: error.message });
    } else {
      updateDraft(i, { busy: false, ok: true, name: "", address: "", tz_override: "" });
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Add locations</h1>
        <button
          type="button"
          onClick={addDraft}
          disabled={loading || bizOptions.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Add new location
        </button>
      </header>

      {loading && <p className="text-sm opacity-70">Loading…</p>}

      {!loading && bizOptions.length === 0 && (
        <div className="rounded-md border p-4 text-sm">
          No verified businesses where you are a manager. Verification and manager role are required to add locations.
        </div>
      )}

      <div className="space-y-6">
        {drafts.map((d, i) => (
          <form
            key={i}
            onSubmit={(e) => { e.preventDefault(); submitOne(i); }}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Location {i+1}</h2>
              <button
                type="button"
                onClick={() => removeDraft(i)}
                className="text-sm opacity-70 hover:opacity-100"
              >
                Remove
              </button>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block">Business</span>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={d.business_id}
                onChange={(e) => updateDraft(i, { business_id: e.target.value })}
                required
              >
                {bizOptions.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block">Name*</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="e.g., Main Street"
                value={d.name}
                onChange={(e) => updateDraft(i, { name: e.target.value })}
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block">Address</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="123 Example Ave, City ST"
                value={d.address}
                onChange={(e) => updateDraft(i, { address: e.target.value })}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block">Time zone override (IANA, optional)</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="America/Denver"
                value={d.tz_override}
                onChange={(e) => updateDraft(i, { tz_override: e.target.value })}
              />
            </label>

            {d.err && <p className="text-sm text-red-600">{d.err}</p>}
            {d.ok && <p className="text-sm text-green-700">Location created.</p>}

            <div className="pt-2">
              <button
                type="submit"
                disabled={d.busy}
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {d.busy ? "Saving…" : "Save location"}
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}

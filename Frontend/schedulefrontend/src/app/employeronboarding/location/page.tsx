"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

type Biz = { id: string; name: string; verification_status: string };
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
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const hasBiz = businesses.length > 0;
  const targetBiz = drafts[0]?.business_id || businesses[0]?.id || "";

  const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // Load verified businesses
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        if (alive) {
          setBusinesses([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("business")
        .select("id,name,verification_status")
        .eq("verification_status", "verified");

      if (!alive) return;

      if (error) {
        console.error("Failed to load businesses:", error.message);
        setBusinesses([]);
        setLoading(false);
        return;
      }

      setBusinesses(data ?? []);

      if ((data?.length ?? 0) > 0 && drafts.length === 0) {
        setDrafts([
          {
            business_id: data![0].id,
            name: "",
            address: "",
            tz_override: "",
          },
        ]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bizById = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b])),
    [businesses]
  );

  const addDraft = () =>
    setDrafts((d) => [
      ...d,
      {
        business_id: businesses[0]?.id ?? "",
        name: "",
        address: "",
        tz_override: "",
      },
    ]);

  const updateDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) =>
      d.map((row, idx) =>
        idx === i ? { ...row, ...patch, ok: undefined, err: undefined } : row
      )
    );

  const removeDraft = (i: number) =>
    setDrafts((d) => d.filter((_, idx) => idx !== i));

  const submitOne = async (i: number) => {
    const d = drafts[i];
    if (!d.business_id || !d.name.trim()) {
      updateDraft(i, { err: "Business and name are required." });
      return;
    }

    updateDraft(i, { busy: true, err: null });

    const { error } = await supabase.from("location").insert({
      business_id: d.business_id,
      name: d.name.trim(),
      address: d.address?.trim() || null,
      tz_override: d.tz_override?.trim() || null,
    });

    if (error) {
      updateDraft(i, { busy: false, err: error.message });
    } else {
      updateDraft(i, {
        busy: false,
        ok: true,
        name: "",
        address: "",
        tz_override: "",
      });
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Add Locations</h1>
        <button
          type="button"
          onClick={addDraft}
          disabled={loading || !hasBiz}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Add New Location
        </button>
      </header>

      {loading && <p className="text-sm opacity-70">Loading…</p>}

      {!loading && !hasBiz && (
        <div className="rounded-md border p-4 text-sm">
          No verified businesses you own or manage.
        </div>
      )}

      <div className="space-y-6">
        {drafts.map((d, i) => (
          <form
            key={i}
            onSubmit={(e) => {
              e.preventDefault();
              void submitOne(i);
            }}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Location {i + 1}</h2>
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
                onChange={(e) =>
                  updateDraft(i, { business_id: e.target.value })
                }
                required
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs opacity-70">
                Status:{" "}
                {bizById[d.business_id]?.verification_status ?? "unknown"}
              </p>
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
              <span className="mb-1 block">Time Zone Override (optional)</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="America/Denver"
                value={d.tz_override}
                onChange={(e) =>
                  updateDraft(i, { tz_override: e.target.value })
                }
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
                {d.busy ? "Saving…" : "Save Location"}
              </button>
            </div>
          </form>
        ))}
      </div>

      <button
        className="px-4 py-2 border rounded"
        disabled={!isUUID(targetBiz)}
        onClick={() =>
          router.push(`/employeronboarding/roles/${targetBiz}`)
        }
      >
        Continue
      </button>
    </div>
  );
}

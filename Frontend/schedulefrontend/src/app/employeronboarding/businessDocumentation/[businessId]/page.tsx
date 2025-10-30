"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

type VerificationStatus = "unverified" | "docs_submitted" | "verified" | "rejected";

type DocKind =
  | "articles" | "license" | "cp575" | "147c"
  | "lease" | "auth_letter" | "id_front" | "id_back" | "other";

const KINDS: DocKind[] = ["articles","license","cp575","147c","lease","auth_letter","id_front","id_back","other"];

type BusinessRow = {
  id: string;
  legal_name: string | null;
  jurisdiction: string | null;
  state_entity_no: string | null;
  domain: string | null;
  verification_status: VerificationStatus;
};

type BusinessDocRow = {
  id: string;
  kind: DocKind;
  storage_path: string;
  status: "pending" | "accepted" | "rejected";
  uploaded_at: string;           // ISO string from Supabase
  notes: string | null;
  reviewed_at: string | null;
};

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function BusinessDocumentationPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { businessId } = useParams() as { businessId: string };

  const [loading, setLoading] = useState<boolean>(true);
  const [biz, setBiz] = useState<BusinessRow | null>(null);
  const [docs, setDocs] = useState<BusinessDocRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [legal, setLegal] = useState<{ legal_name: string; jurisdiction: string; state_entity_no: string; domain: string }>({
    legal_name: "",
    jurisdiction: "",
    state_entity_no: "",
    domain: ""
  });
  const [ein, setEin] = useState<string>("");
  const [kind, setKind] = useState<DocKind>("articles");
  const [file, setFile] = useState<File | null>(null);

  const statusBadge = useMemo(() => {
    const s: VerificationStatus = (biz?.verification_status ?? "unverified") as VerificationStatus;
    const statusClassMap: Record<VerificationStatus, string> = {
      unverified: "bg-gray-200",
      docs_submitted: "bg-yellow-200",
      verified: "bg-green-200",
      rejected: "bg-red-200",
    };
    const c = statusClassMap[s];
    return <span className={`px-2 py-0.5 rounded text-xs ${c}`}>{s}</span>;
  }, [biz]);

  useEffect(() => {
  if (!businessId) return;
  let alive = true;
  (async () => {
    setLoading(true); setErr(null);
    const { data: b, error: be } = await supabase
      .from("business")
      .select("id, legal_name, jurisdiction, state_entity_no, domain, verification_status")
      .eq("id", businessId).single();  // single() since id is PK
    if (!alive) return;
    if (be) { setErr(be.message); setLoading(false); return; }

    setBiz(b);
    setLegal({
      legal_name: b.legal_name ?? "",
      jurisdiction: b.jurisdiction ?? "",
      state_entity_no: b.state_entity_no ?? "",
      domain: b.domain ?? ""
    });

    const { data: d, error: de } = await supabase
      .from("business_doc")
      .select("id, kind, storage_path, status, uploaded_at, notes, reviewed_at")
      .eq("business_id", businessId)
      .order("uploaded_at", { ascending: false });
    if (de) setErr(de.message); else setDocs(d ?? []);
    setLoading(false);
  })();
  return () => { alive = false; };
}, [businessId, supabase]);


  const saveLegal = async (): Promise<void> => {
    setErr(null);
    const { error } = await supabase
      .from("business")
      .update(legal)
      .eq("id", businessId);
    if (error) setErr(error.message);
  };

  const setEinRpc = async (): Promise<void> => {
    if (!ein.trim()) return;
    setErr(null);
    const { error } = await supabase.rpc("set_business_ein", { p_business: businessId, p_ein: ein });
    if (error) setErr(error.message);
  };

  // inside BusinessDocumentationPage, after setEinRpc()
const uploadDoc = async (): Promise<void> => {
  if (!file) { setErr("Choose a file"); return; }
  setErr(null);

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) { setErr("Not signed in"); return; }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const key = `${businessId}/${crypto.randomUUID()}.${ext}`;

  const up = await supabase.storage.from("business-docs").upload(key, file, { upsert: false });
  if (up.error) { setErr(up.error.message); return; }

  const hex = await sha256(file);
  const { error: insErr } = await supabase.from("business_doc").insert({
    business_id: businessId,
    kind,
    storage_path: key,
    sha256: `\\x${hex}`,
    uploaded_by: user.id,
  } as const);
  if (insErr) { setErr(insErr.message); return; }

  if (biz?.verification_status === "unverified") {
    await supabase.from("business").update({ verification_status: "docs_submitted" }).eq("id", businessId);
    setBiz(v => (v ? { ...v, verification_status: "docs_submitted" } : v));
  }

  const { data: d2, error: d2e } = await supabase
    .from("business_doc")
    .select("id, kind, storage_path, status, uploaded_at, notes, reviewed_at")
    .eq("business_id", businessId)
    .order("uploaded_at", { ascending: false });
  if (d2e) { setErr(d2e.message); return; }

  setDocs(d2 ?? []);
  setFile(null);
};


  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Business documents</h1>
          <p className="text-sm text-muted-foreground">Provide legal data and upload supporting files.</p>
        </div>
        <div className="text-right">
          <div className="text-xs">Business ID</div>
          <div className="text-xs font-mono">
            {businessId}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => navigator.clipboard.writeText(String(businessId))}
            >
              Copy
            </button>
          </div>
          <div className="mt-1">{statusBadge}</div>
        </div>
      </header>

      {/* Business info */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-medium">Business info</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span>Legal name</span>
            <input
              className="border rounded p-2"
              value={legal.legal_name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLegal(s => ({ ...s, legal_name: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Jurisdiction (state)</span>
            <input
              className="border rounded p-2"
              value={legal.jurisdiction}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLegal(s => ({ ...s, jurisdiction: e.target.value.toUpperCase() }))}
              placeholder="UT"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>State entity number</span>
            <input
              className="border rounded p-2"
              value={legal.state_entity_no}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLegal(s => ({ ...s, state_entity_no: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Domain (optional)</span>
            <input
              className="border rounded p-2"
              value={legal.domain}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLegal(s => ({ ...s, domain: e.target.value }))}
              placeholder="https://example.com"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={saveLegal}>Save</button>
        </div>
      </section>

      {/* EIN */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-medium">Employer Identification Number (optional)</h2>
        <div className="flex gap-2 items-center">
          <input
            className="border rounded p-2 flex-1"
            placeholder="12-3456789"
            value={ein}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEin(e.target.value)}
          />
          <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={setEinRpc}>
            Save EIN
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Stored as hash + last 4 via secure RPC.</p>
      </section>

      {/* Upload document */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-medium">Upload documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm md:col-span-1">
            <span>Type</span>
            <select
              className="border rounded p-2"
              value={kind}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKind(e.target.value as DocKind)}
            >
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>File (PDF/PNG/JPG)</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={uploadDoc}>Upload</button>
        </div>
            {err && (
      <div className="w-full flex justify-center">
        <div className="px-4 py-2 rounded border border-red-200 bg-red-50 text-red-700">
            {err}
          </div>
        </div>
    )}
      </section>

      {/* Submitted files */}
      <section className="space-y-3 border rounded-lg p-4">
        <h2 className="font-medium">Submitted files</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Path</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Uploaded</th>
                <th className="py-2 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d: BusinessDocRow) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{d.kind}</td>
                  <td className="py-2 pr-3 font-mono">{d.storage_path}</td>
                  <td className="py-2 pr-3">{d.status}</td>
                  <td className="py-2 pr-3">{new Date(d.uploaded_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{d.notes ?? ""}</td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr><td className="py-2 pr-3" colSpan={5}>No documents yet.</td></tr>
              )}
            </tbody>
          </table>
          <button
          className="px-4 py-2 border rounded"
              onClick={() => router.push("/employeronboarding/location")}>
              Continue
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          After first upload, status becomes <b>docs_submitted</b>. Admin review will set <b>verified</b> or <b>rejected</b>.
        </p>
      </section>
    </div>
  );
}
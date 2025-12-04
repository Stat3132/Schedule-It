"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Building2, FileText, ShieldCheck } from "lucide-react";

type VerificationStatus = "unverified" | "docs_submitted" | "verified" | "rejected";

type DocKind =
  | "articles" | "license" | "cp575" | "147c"
  | "lease" | "auth_letter" | "id_front" | "id_back" | "other";

const KINDS: DocKind[] = ["articles","license","cp575","147c","lease","auth_letter","id_front","id_back","other"];

type BusinessRow = {
  id: string;
  name: string | null;
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
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();
  const { businessId } = useParams() as { businessId: string };

  const [loading, setLoading] = useState<boolean>(true);
  const [biz, setBiz] = useState<BusinessRow | null>(null);
  const [docs, setDocs] = useState<BusinessDocRow[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [businessName, setBusinessName] = useState<string>("");

  // form state
  const [legal, setLegal] = useState<{ legal_name: string; jurisdiction: string; domain: string }>({
    legal_name: "",
    jurisdiction: "",
    domain: ""
  });
  const [ein, setEin] = useState<string>("");
  const [kind, setKind] = useState<DocKind>("articles");
  const [file, setFile] = useState<File | null>(null);
  const [uploadNote, setUploadNote] = useState<string>("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [isSavingLegal, setIsSavingLegal] = useState<boolean>(false);
  const [uploadAlert, setUploadAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

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
    setLoading(true); setPageError(null);
    const { data: b, error: be } = await supabase
      .from("business")
      .select("id, name, legal_name, jurisdiction, state_entity_no, domain, verification_status")
      .eq("id", businessId).single();  // single() since id is PK
    if (!alive) return;
    if (be) { setPageError(be.message); setLoading(false); return; }

    setBiz(b);
    setBusinessName(b.name ?? "");
    setLegal({
      legal_name: b.legal_name ?? "",
      jurisdiction: b.jurisdiction ?? "",
      domain: b.domain ?? ""
    });

    const { data: d, error: de } = await supabase
      .from("business_doc")
      .select("id, kind, storage_path, status, uploaded_at, notes, reviewed_at")
      .eq("business_id", businessId)
      .order("uploaded_at", { ascending: false });
    if (de) setPageError(de.message); else setDocs(d ?? []);
    setLoading(false);
  })();
  return () => { alive = false; };
}, [businessId, supabase]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!uploadAlert) return;
    const timer = setTimeout(() => setUploadAlert(null), 5000);
    return () => clearTimeout(timer);
  }, [uploadAlert]);


  const saveLegal = async (): Promise<void> => {
    setBanner(null);
    const domainTrimmed = legal.domain.trim();
    if (!domainTrimmed) {
      const message = "Domain is required before saving.";
      setDomainError(message);
      setBanner({ type: "error", message });
      return;
    }
    setDomainError(null);
    setIsSavingLegal(true);
    const payload = {
      ...legal,
      domain: domainTrimmed,
      name: businessName.trim() || null,
    };
    const { error } = await supabase
      .from("business")
      .update(payload)
      .eq("id", businessId);
    if (error) {
      setBanner({ type: "error", message: error.message });
    } else {
      setBiz((prev) => (prev ? { ...prev, ...payload } : prev));
      setBanner({ type: "success", message: "Business information saved." });
    }
    setIsSavingLegal(false);
  };

  const setEinRpc = async (): Promise<void> => {
    if (!ein.trim()) return;
    const { error } = await supabase.rpc("set_business_ein", { p_business: businessId, p_ein: ein });
    if (error) setBanner({ type: "error", message: error.message });
  };

  // inside BusinessDocumentationPage, after setEinRpc()
const uploadDoc = async (): Promise<void> => {
  if (!file) { setUploadAlert({ type: "error", message: "Select a file before uploading." }); return; }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) { setUploadAlert({ type: "error", message: "Not signed in." }); return; }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const key = `${businessId}/${crypto.randomUUID()}.${ext}`;

  const up = await supabase.storage.from("business-docs").upload(key, file, { upsert: false });
  if (up.error) { setUploadAlert({ type: "error", message: up.error.message }); return; }

  const hex = await sha256(file);
  const { error: insErr } = await supabase.from("business_doc").insert({
    business_id: businessId,
    kind,
    storage_path: key,
    sha256: `\\x${hex}`,
    uploaded_by: user.id,
    notes: uploadNote.trim() || null,
  } as const);
  if (insErr) { setUploadAlert({ type: "error", message: insErr.message }); return; }

  if (biz?.verification_status === "unverified") {
    await supabase.from("business").update({ verification_status: "docs_submitted" }).eq("id", businessId);
    setBiz(v => (v ? { ...v, verification_status: "docs_submitted" } : v));
  }

  const { data: d2, error: d2e } = await supabase
    .from("business_doc")
    .select("id, kind, storage_path, status, uploaded_at, notes, reviewed_at")
    .eq("business_id", businessId)
    .order("uploaded_at", { ascending: false });
  if (d2e) { setUploadAlert({ type: "error", message: d2e.message }); return; }

  setDocs(d2 ?? []);
  setFile(null);
  setUploadNote("");
  setUploadAlert({ type: "success", message: "Document uploaded." });
};


  if (loading) return <div className="p-6">Loading…</div>;
  if (pageError) return <div className="p-6 text-red-600">{pageError}</div>;

  const canSaveBusiness = Boolean(legal.domain.trim());
  const canUpload = Boolean(file);
  const isVerified = biz?.verification_status === "verified";
  const awaitingVerification = Boolean(biz && !isVerified);
  const cameFromLogin = searchParams?.get("from") === "login";

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {banner && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
              banner.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {banner.message}
          </div>
        )}
        {/* Hero / guidance */}
        <header className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 items-start gap-3">
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Step 2 of 4</p>
                <h1 className="text-2xl font-semibold text-foreground">Business documentation</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Provide the legal details used on tax forms and upload supporting identity documents so we can activate your workspace.
                </p>
                {businessName && (
                  <p className="mt-2 text-sm text-foreground">
                    Current display name: <span className="font-medium">{businessName}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Business ID</p>
              <p className="font-mono text-xs break-all">{businessId}</p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-primary hover:underline"
                onClick={() => navigator.clipboard.writeText(String(businessId))}
              >
                Copy to clipboard
              </button>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="font-medium text-muted-foreground">Status</span>
                {statusBadge}
              </div>
            </div>
          </div>
          <div className="mt-5 h-1.5 w-full rounded-full bg-muted">
            <div className="h-full w-3/5 rounded-full bg-primary" />
          </div>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-6">
            <li className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Legal profile
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Ownership verification
            </li>
          </ul>
        </header>

        {awaitingVerification && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Awaiting verification</p>
                <p className="mt-1 text-amber-900/80">
                  We’re reviewing your submissions. Upload any missing documents or adjust your legal info. We’ll email you as soon as the review finishes.
                </p>
              </div>
              {cameFromLogin && (
                <button
                  type="button"
                  className="w-full rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 sm:w-auto"
                  onClick={() => router.push("/employerregistration")}
                >
                  Back to login
                </button>
              )}
            </div>
          </div>
        )}

        {/* Business info */}
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary"><Building2 className="h-4 w-4" /></div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Business info</h2>
              <p className="text-sm text-muted-foreground">These fields appear on internal tools and invoices.</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business name</span>
              <input
                className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
                value={businessName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusinessName(e.target.value)}
                placeholder="Acme Corp"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legal name</span>
              <input
                className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
                value={legal.legal_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLegal((s) => ({ ...s, legal_name: e.target.value }))}
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jurisdiction (state)</span>
              <input
                className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
                value={legal.jurisdiction}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLegal((s) => ({ ...s, jurisdiction: e.target.value.toUpperCase() }))}
                placeholder="UT"
              />
            </label>
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Domain *</span>
              <input
                className={`mt-1 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring ${
                  domainError ? "border-red-400 focus:ring-red-300" : "border-input"
                }`}
                value={legal.domain}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  setLegal((s) => ({ ...s, domain: value }));
                  if (value.trim()) {
                    setDomainError(null);
                    if (banner?.type === "error") setBanner(null);
                  }
                }}
                onBlur={() => {
                  if (!legal.domain.trim()) {
                    setDomainError("Domain is required.");
                  }
                }}
                required
                placeholder="https://example.com"
              />
              {domainError && <p className="mt-1 text-xs text-red-600">{domainError}</p>}
            </label>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Use your legal documents to avoid verification delays.</p>
            <button
              className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold shadow transition ${
                canSaveBusiness && !isSavingLegal
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              type="button"
              onClick={saveLegal}
              disabled={!canSaveBusiness || isSavingLegal}
            >
              {isSavingLegal ? "Saving..." : "Save business info"}
            </button>
          </div>
        </section>

        {/* EIN */}
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Employer Identification Number</h2>
          <p className="text-sm text-muted-foreground">Optional but speeds up verification. Stored as a secure hash.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
              placeholder="12-3456789"
              value={ein}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEin(e.target.value)}
            />
            <button
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary"
              type="button"
              onClick={setEinRpc}
            >
              Save EIN
            </button>
          </div>
        </section>

        {/* Upload document */}
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Upload documents</h2>
          <p className="text-sm text-muted-foreground">Accepted formats: PDF, PNG, JPG. Upload each required file separately.</p>
          {uploadAlert && (
            <div
              role="status"
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                uploadAlert.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {uploadAlert.message}
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="md:col-span-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document type</span>
              <select
                className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
                value={kind}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKind(e.target.value as DocKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload file *</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="mt-2 block w-full cursor-pointer rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 px-4 py-10 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setFile(e.target.files?.[0] ?? null);
                  if (uploadAlert) setUploadAlert(null);
                }}
              />
              <p className="mt-2 text-xs text-muted-foreground">Drag in a PDF or image, or click to browse from your device.</p>
            </label>
            <label className="md:col-span-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer note (optional)</span>
              <textarea
                className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
                rows={3}
                placeholder="Add context for this document (ex: license renewal in progress)."
                value={uploadNote}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setUploadNote(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Tip: combine multiple pages into one PDF for faster review.</p>
            <button
              className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold shadow transition ${
                canUpload
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              type="button"
              onClick={uploadDoc}
              disabled={!canUpload}
            >
              Upload file
            </button>
          </div>
        </section>

        {/* Submitted files */}
        <section className="rounded-2xl border border-border bg-background p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Submitted files</h2>
            <p className="text-sm text-muted-foreground">Track review status for each upload.</p>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {docs.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No documents yet.
              </div>
            )}
            {docs.map((d) => (
              <div key={d.id} className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize">{d.kind}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{d.status}</span>
                </div>
                <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{d.storage_path}</p>
                <p className="mt-2 text-xs text-muted-foreground">Uploaded {new Date(d.uploaded_at).toLocaleString()}</p>
                {d.notes && <p className="mt-1 text-xs text-foreground">Notes: {d.notes}</p>}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
                    <td className="py-2 pr-3 capitalize">{d.kind}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{d.storage_path}</td>
                    <td className="py-2 pr-3 capitalize">{d.status}</td>
                    <td className="py-2 pr-3">{new Date(d.uploaded_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{d.notes ?? ""}</td>
                  </tr>
                ))}
                {docs.length === 0 && (
                  <tr>
                    <td className="py-3 text-sm" colSpan={5}>
                      No documents yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-dashed border-border pt-4 text-xs text-muted-foreground">
            <p>
              After your first upload the status moves to <span className="font-semibold">docs_submitted</span>. Our team will change it to
              <span className="font-semibold"> verified</span> or <span className="font-semibold">rejected</span> with reviewer notes.
            </p>
            <button
              className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold shadow transition ${
                isVerified
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
              type="button"
              onClick={() => router.push("/employeronboarding/location")}
              disabled={!isVerified}
            >
              Continue to locations
            </button>
            {!isVerified && (
              <p className="text-xs text-muted-foreground">
                Locations unlock once your business is verified.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
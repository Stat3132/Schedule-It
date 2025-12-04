"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestError } from "@supabase/supabase-js";
import {
    Building2,
    ChevronDown,
    Clock,
    MapPin,
    RefreshCw,
    Users,
} from "lucide-react";

type Biz = {
    id: string;
    name: string;
    verification_status: string;
    timezone: string | null;
};

type LocationRow = {
    id: string;
    name: string | null;
    address?: string | null;
    opens_at?: string | null;
    closes_at?: string | null;
    hours_by_day?: unknown | null;
};

type RoleRow = {
    id: string;
    business_id: string;
    name: string;
    color: string | null;
    description: string | null;
};

type DayKey =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";

type DayHours = {
    opens_at: string;
    closes_at: string;
    closed: boolean;
};

type DailyHours = Record<DayKey, DayHours>;

type LocationDraft = {
    business_id: string;
    name: string;
    address: string;
    tz_override: string;
    opens_at: string;
    closes_at: string;
    hoursMode: "uniform" | "per-day";
    perDayHours: DailyHours;
    busy?: boolean;
    err?: string | null;
    ok?: boolean;
};

const weekdayOrder: DayKey[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

const weekdayLabels: Record<DayKey, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
};

const weekdayLabelsShort: Record<DayKey, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
};

const isUUID = (s?: string | null): s is string =>
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const hasPgCode = (e: unknown): e is PostgrestError =>
    typeof e === "object" && e !== null && "message" in e;

const createPerDayHours = (open = "09:00", close = "17:00"): DailyHours =>
    weekdayOrder.reduce((acc, day) => {
        acc[day] = { opens_at: open, closes_at: close, closed: false };
        return acc;
    }, {} as DailyHours);

const formatTime = (value: string | null | undefined) => {
    if (!value) return null;
    const [hh, mm] = value.split(":");
    if (hh == null || mm == null) return value;
    return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
};

const formatToAmPm = (value?: string | null) => {
    if (!value) return null;
    const [hh, mm] = value.split(":");
    if (hh == null || mm == null) return value;
    const h = Number(hh);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12.toString().padStart(2, "0")}:${mm} ${suffix}`;
};

const expandHoursRows = (
    hoursObj: unknown,
    fallbackOpen?: string | null,
    fallbackClose?: string | null
) => {
    const normalize = (t?: string | null) => formatTime(t ?? undefined);
    let obj: Record<DayKey, { opens_at?: string | null; closes_at?: string | null; closed?: boolean }> =
        {} as Record<DayKey, { opens_at?: string | null; closes_at?: string | null; closed?: boolean }>;

    if (hoursObj) {
        if (typeof hoursObj === "string") {
            try {
                obj = JSON.parse(hoursObj);
            } catch {
                obj = {} as Record<DayKey, { opens_at?: string | null; closes_at?: string | null; closed?: boolean }>;
            }
        } else if (typeof hoursObj === "object" && hoursObj !== null) {
            // Assert the runtime object shape to the expected Record type after basic validation
            obj = hoursObj as Record<DayKey, { opens_at?: string | null; closes_at?: string | null; closed?: boolean }>;
        } else {
            obj = {} as Record<DayKey, { opens_at?: string | null; closes_at?: string | null; closed?: boolean }>;
        }
    }

    return weekdayOrder.map((day) => {
        const entry = obj[day] ?? {
            opens_at: fallbackOpen ?? null,
            closes_at: fallbackClose ?? null,
            closed: false,
        };
        if (entry.closed) {
            return { day, closed: true } as const;
        }
        const open = normalize(entry.opens_at) ?? normalize(fallbackOpen) ?? "";
        const close = normalize(entry.closes_at) ?? normalize(fallbackClose) ?? "";
        return { day, closed: !open || !close, opens_at: open, closes_at: close } as const;
    });
};

const toMinutes = (t: string) => {
    const [hh, mm] = t.split(":");
    return Number(hh) * 60 + Number(mm);
};

const minutesToTime = (mins: number) => {
    const hh = Math.floor(mins / 60)
        .toString()
        .padStart(2, "0");
    const mm = (mins % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
};

const createLocationDraft = (businessId: string): LocationDraft => ({
    business_id: businessId,
    name: "",
    address: "",
    tz_override: "",
    opens_at: "09:00",
    closes_at: "17:00",
    hoursMode: "uniform",
    perDayHours: createPerDayHours(),
});

export default function LocationAndRoleInfoPage() {
    const supabase = createClientComponentClient();
    const router = useRouter();
    const params = useParams();

    const rawParam =
        (params as Record<string, unknown>)?.businessId ??
        (params as Record<string, unknown>)?.businessid;
    const rawStr = Array.isArray(rawParam)
        ? (rawParam[0] as string | undefined)
        : (rawParam as string | undefined);
    const businessId = rawStr ?? null;

    const [business, setBusiness] = useState<Biz | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [locations, setLocations] = useState<LocationRow[]>([]);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [locationDraft, setLocationDraft] = useState<LocationDraft | null>(null);
    const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
    const [roleForm, setRoleForm] = useState({ name: "", color: "", description: "" });
    const [roleErr, setRoleErr] = useState<string | null>(null);
    const [locationFormOpen, setLocationFormOpen] = useState(false);
    const [roleFormOpen, setRoleFormOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimer = useRef<number | null>(null);

    const canEdit = business?.verification_status === "verified";

    const refreshLocations = useCallback(
        async (bizId: string) => {
            const { data, error } = await supabase
                .from("location")
                .select("id,name,address,opens_at,closes_at,hours_by_day")
                .eq("business_id", bizId)
                .order("name", { ascending: true });
            if (error) {
                console.error("Failed to load locations", error.message);
                return;
            }
            setLocations(data ?? []);
        },
        [supabase]
    );

    const refreshRoles = useCallback(
        async (bizId: string) => {
            const { data, error } = await supabase
                .from("role")
                .select("id,business_id,name,color,description")
                .eq("business_id", bizId)
                .order("name", { ascending: true });
            if (error) {
                console.error("Failed to load roles", error.message);
                return;
            }
            setRoles(data ?? []);
        },
        [supabase]
    );

    useEffect(() => {
        return () => {
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
        };
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!isUUID(businessId)) {
                setError("Invalid business id");
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            const { data: session } = await supabase.auth.getSession();
            if (!session?.session) {
                setError("Not authenticated");
                setLoading(false);
                return;
            }

            const { data: bizRow, error: bizErr } = await supabase
                .from("business")
                .select("id,name,verification_status,timezone,owner_user_id")
                .eq("id", businessId)
                .maybeSingle();

            if (!alive) return;

            if (bizErr || !bizRow) {
                setError(bizErr?.message ?? "Business not found");
                setLoading(false);
                return;
            }

            if (bizRow.owner_user_id !== session.session.user.id) {
                setError("You do not have access to this business.");
                setLoading(false);
                return;
            }

            setBusiness({
                id: bizRow.id,
                name: bizRow.name,
                verification_status: bizRow.verification_status,
                timezone: bizRow.timezone,
            });
            setLocationDraft((prev) => prev ?? createLocationDraft(bizRow.id));

            await Promise.all([refreshLocations(bizRow.id), refreshRoles(bizRow.id)]);
            if (!alive) return;
            setLoading(false);
        })();

        return () => {
            alive = false;
        };
    }, [businessId, refreshLocations, refreshRoles, supabase]);

    const updateLocationDraft = (patch: Partial<LocationDraft>) =>
        setLocationDraft((current) =>
            current ? { ...current, ...patch, err: null, ok: undefined } : current
        );

    const updatePerDayHours = (day: DayKey, patch: Partial<DayHours>) =>
        setLocationDraft((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                perDayHours: {
                    ...prev.perDayHours,
                    [day]: { ...prev.perDayHours[day], ...patch },
                },
                err: null,
                ok: undefined,
            };
        });

    const switchHoursMode = (mode: LocationDraft["hoursMode"]) =>
        setLocationDraft((prev) => {
            if (!prev || mode === prev.hoursMode) return prev;
            if (mode === "per-day") {
                return {
                    ...prev,
                    hoursMode: mode,
                    perDayHours: createPerDayHours(prev.opens_at, prev.closes_at),
                };
            }
            const firstOpenDay = weekdayOrder.find((day) => !prev.perDayHours[day]?.closed);
            return {
                ...prev,
                hoursMode: mode,
                opens_at: firstOpenDay ? prev.perDayHours[firstOpenDay].opens_at : prev.opens_at,
                closes_at: firstOpenDay ? prev.perDayHours[firstOpenDay].closes_at : prev.closes_at,
            };
        });

    const saveLocation = async () => {
        if (!locationDraft) return;
        const d = locationDraft;

        if (!d.name.trim()) {
            updateLocationDraft({ err: "Location name is required." });
            return;
        }

        if (d.hoursMode === "uniform") {
            if (!d.opens_at || !d.closes_at) {
                updateLocationDraft({ err: "Open and close times are required." });
                return;
            }
            if (toMinutes(d.closes_at) <= toMinutes(d.opens_at)) {
                updateLocationDraft({ err: "Closing time must be later than opening time." });
                return;
            }
        } else {
            const perDayList = weekdayOrder.map((day) => ({ day, ...d.perDayHours[day] }));
            const openDays = perDayList.filter((entry) => !entry.closed);
            if (openDays.length === 0) {
                updateLocationDraft({ err: "Select hours for at least one day." });
                return;
            }
            for (const entry of openDays) {
                if (!entry.opens_at || !entry.closes_at) {
                    updateLocationDraft({ err: `Hours missing for ${weekdayLabels[entry.day]}.` });
                    return;
                }
                if (toMinutes(entry.closes_at) <= toMinutes(entry.opens_at)) {
                    updateLocationDraft({
                        err: `${weekdayLabels[entry.day]} closing must be later than opening.`,
                    });
                    return;
                }
            }
        }

        updateLocationDraft({ busy: true });

        const payload: Record<string, unknown> = {
            business_id: d.business_id,
            name: d.name.trim(),
            address: d.address?.trim() || null,
            tz_override: d.tz_override?.trim() || null,
            opens_at: d.opens_at,
            closes_at: d.closes_at,
            hours_by_day: null,
        };

        if (d.hoursMode === "per-day") {
            const hoursByDay = weekdayOrder.reduce((acc, day) => {
                const entry = d.perDayHours[day];
                acc[day] = {
                    opens_at: entry.closed ? null : entry.opens_at,
                    closes_at: entry.closed ? null : entry.closes_at,
                    closed: entry.closed,
                };
                return acc;
            }, {} as Record<DayKey, { opens_at: string | null; closes_at: string | null; closed: boolean }>);

            const openDayEntries = weekdayOrder
                .map((day) => hoursByDay[day])
                .filter((entry) => !entry.closed && entry.opens_at && entry.closes_at) as {
                opens_at: string;
                closes_at: string;
                closed: false;
            }[];

            const earliest = Math.min(...openDayEntries.map((entry) => toMinutes(entry.opens_at)));
            const latest = Math.max(...openDayEntries.map((entry) => toMinutes(entry.closes_at)));

            payload.opens_at = minutesToTime(earliest);
            payload.closes_at = minutesToTime(latest);
            payload.hours_by_day = hoursByDay;
        }

        const { data: inserted, error } = await supabase
            .from("location")
            .insert(payload)
            .select("id,business_id,name,opens_at,closes_at,hours_by_day")
            .maybeSingle();

        if (error) {
            updateLocationDraft({ busy: false, err: error.message });
            return;
        }

        if (inserted) {
            await refreshLocations(d.business_id);
            setExpandedLocationId(inserted.id ?? null);
            setToastMessage(`${inserted.name ?? d.name} added`);
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => setToastMessage(null), 2800);
        }

        setLocationDraft(createLocationDraft(d.business_id));
    };

    const handleRoleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setRoleErr(null);

        if (!isUUID(businessId)) {
            setRoleErr("Invalid business id");
            return;
        }
        if (!canEdit) {
            setRoleErr("Business not verified");
            return;
        }
        if (!roleForm.name.trim()) {
            setRoleErr("Role name is required");
            return;
        }
        if (!roleForm.color.trim()) {
            setRoleErr("Color is required");
            return;
        }
        if (!/^#?[0-9a-fA-F]{6}$/.test(roleForm.color)) {
            setRoleErr("Color must be 6-digit hex");
            return;
        }
        if (!roleForm.description.trim()) {
            setRoleErr("Description is required");
            return;
        }

        const payload = {
            business_id: businessId,
            name: roleForm.name.trim(),
            color: roleForm.color.startsWith("#") ? roleForm.color : `#${roleForm.color}`,
            description: roleForm.description.trim(),
        };

        const { data, error } = await supabase.from("role").insert(payload).select().single();

        if (error) {
            if (hasPgCode(error) && (error.code === "23505" || error.message.includes("duplicate"))) {
                setRoleErr("Role name already exists");
            } else {
                setRoleErr(error.message);
            }
            return;
        }

        const inserted = data as RoleRow;
        setRoles((prev) => [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)));
        setRoleForm({ name: "", color: "", description: "" });
        setToastMessage(`${inserted.name} added`);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToastMessage(null), 2800);
    };

    const updateRole = async (id: string, patch: Partial<RoleRow>) => {
        setRoleErr(null);
        const { data, error } = await supabase
            .from("role")
            .update(patch)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            if (hasPgCode(error) && (error.code === "23505" || error.message.includes("duplicate"))) {
                setRoleErr("Duplicate role name");
            } else {
                setRoleErr(error.message);
            }
            return;
        }

        const updated = data as RoleRow;
        setRoles((prev) => prev.map((r) => (r.id === id ? updated : r)).sort((a, b) => a.name.localeCompare(b.name)));
    };

    const deleteRole = async (id: string) => {
        setRoleErr(null);
        const { error } = await supabase.from("role").delete().eq("id", id);
        if (error) {
            setRoleErr(error.message);
            return;
        }
        setRoles((prev) => prev.filter((r) => r.id !== id));
    };

    const previewHeader = business ? business.name : "Loading business…";

    if (loading) return <div className="p-6 text-sm">Loading…</div>;
    if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

    return (
        <div className="mx-auto max-w-6xl p-6">
            {toastMessage && (
                <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
                    <div className="rounded-md bg-slate-900 px-4 py-2 text-white shadow">{toastMessage}</div>
                </div>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <aside className="space-y-4 lg:col-span-2">
                    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                        <header className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                                    <Building2 className="h-3 w-3" />
                                    <span>{previewHeader}</span>
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Locations</h2>
                                <p className="text-xs text-slate-600">Track locations and hours before inviting your team.</p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                                onClick={() => business && refreshLocations(business.id)}
                                aria-label="Refresh locations"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </button>
                        </header>

                        <div className="mt-3 text-xs text-slate-500">
                            {locations.length === 0
                                ? "No locations yet for this business."
                                : `${locations.length} location${locations.length === 1 ? "" : "s"} total`}
                        </div>

                        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70">
                            <div className="max-h-[420px] overflow-y-auto p-3">
                                {locations.length === 0 ? (
                                    <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-xs text-slate-500">
                                        <p className="font-medium">No locations yet.</p>
                                        <p>Open the location form on the right to add your first location.</p>
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-slate-200">
                                        {locations.slice(0, 12).map((loc, idx) => (
                                            <li key={loc.id} className="flex gap-3 px-2 py-3 hover:bg-white">
                                                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
                                                    {idx + 1}
                                                </div>
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0 pr-2">
                                                            <p className="truncate text-sm font-medium text-slate-900">{loc.name ?? "(untitled location)"}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedLocationId((prev) => (prev === loc.id ? null : loc.id))}
                                                            aria-expanded={expandedLocationId === loc.id}
                                                            className={`flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 transition-transform ${
                                                                expandedLocationId === loc.id ? "rotate-180" : ""
                                                            }`}
                                                        >
                                                            <ChevronDown className="h-4 w-4 text-slate-500" />
                                                        </button>
                                                    </div>
                                                    <div className="text-[11px] text-slate-600">
                                                        {loc.hours_by_day ? (
                                                            <div
                                                                className={`overflow-hidden -mx-3 px-3 transition-all duration-250 ${
                                                                    expandedLocationId === loc.id ? "max-h-[480px]" : "max-h-0"
                                                                }`}
                                                            >
                                                                <div className="rounded-xl border border-slate-100 bg-slate-100/80 p-3">
                                                                    <div className="flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                        <Clock className="h-3 w-3" /> Weekly hours
                                                                    </div>
                                                                    <div className="divide-y divide-slate-200">
                                                                        {expandHoursRows(loc.hours_by_day, loc.opens_at, loc.closes_at).map((row) => (
                                                                            <div key={row.day} className="flex items-center gap-4 py-2">
                                                                                <span className="w-20 text-sm font-medium text-slate-800">{weekdayLabelsShort[row.day]}</span>
                                                                                <span className="flex-1 text-sm text-slate-600 font-mono">
                                                                                    {row.closed
                                                                                        ? "Closed"
                                                                                        : `${formatToAmPm(row.opens_at) ?? "--"} – ${formatToAmPm(row.closes_at) ?? "--"}`}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                                                                <Clock className="h-3 w-3" />
                                                                {loc.opens_at && loc.closes_at
                                                                    ? `${formatToAmPm(loc.opens_at)} – ${formatToAmPm(loc.closes_at)}`
                                                                    : "Hours not set"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                        <header className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-blue-500" /> Roles
                                </h3>
                                <p className="text-xs text-slate-600">Quick snapshot of available roles.</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{roles.length} total</span>
                        </header>
                        <div className="mt-3 max-h-[260px] overflow-y-auto">
                            {roles.length === 0 ? (
                                <p className="text-xs text-slate-500">No roles yet. Use the form on the right to add one.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {roles.map((role) => (
                                        <li key={role.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                                            <span
                                                className="h-6 w-6 rounded"
                                                style={{ background: role.color || "#e2e8f0" }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-slate-900">{role.name}</p>
                                                <p className="truncate text-xs text-slate-500">{role.description || "No description"}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>
                </aside>

                <div className="space-y-6 lg:col-span-3">
                    <header className="space-y-1">
                        <h1 className="text-2xl font-semibold">Locations & Roles</h1>
                        <p className="text-sm text-slate-600">
                            Add the basics for your business, then continue to invite your team.
                        </p>
                    </header>

                    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <button
                            type="button"
                            className="flex w-full items-center justify-between text-left"
                            onClick={() => setLocationFormOpen((prev) => !prev)}
                        >
                            <div>
                                <p className="text-base font-semibold text-slate-900">Add Location</p>
                                <p className="text-xs text-slate-500">Specify address and hours. Collapsed by default for a tidy workflow.</p>
                            </div>
                            <ChevronDown
                                className={`h-5 w-5 text-slate-500 transition-transform ${
                                    locationFormOpen ? "rotate-180" : ""
                                }`}
                            />
                        </button>

                        {locationFormOpen && locationDraft && (
                            <form
                                className="mt-4 space-y-3"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void saveLocation();
                                }}
                            >
                                <label className="block text-sm">
                                    <span className="mb-1 block">Location name*</span>
                                    <input
                                        className="w-full rounded-md border px-3 py-2"
                                        value={locationDraft.name}
                                        onChange={(e) => updateLocationDraft({ name: e.target.value })}
                                        disabled={!canEdit}
                                        required
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-1 block">Address</span>
                                    <input
                                        className="w-full rounded-md border px-3 py-2"
                                        value={locationDraft.address}
                                        onChange={(e) => updateLocationDraft({ address: e.target.value })}
                                        disabled={!canEdit}
                                        placeholder="123 Example Ave, City ST"
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-1 block">Time Zone Override</span>
                                    <input
                                        className="w-full rounded-md border px-3 py-2"
                                        value={locationDraft.tz_override}
                                        onChange={(e) => updateLocationDraft({ tz_override: e.target.value })}
                                        disabled={!canEdit}
                                        placeholder={business?.timezone ?? "America/Denver"}
                                    />
                                </label>

                                <fieldset className="space-y-2 rounded-md border p-3">
                                    <legend className="text-sm font-medium">Operating hours</legend>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="radio"
                                            name="hours-mode"
                                            checked={locationDraft.hoursMode === "uniform"}
                                            onChange={() => switchHoursMode("uniform")}
                                            disabled={!canEdit}
                                        />
                                        Same hours every day
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="radio"
                                            name="hours-mode"
                                            checked={locationDraft.hoursMode === "per-day"}
                                            onChange={() => switchHoursMode("per-day")}
                                            disabled={!canEdit}
                                        />
                                        Set hours per day
                                    </label>
                                </fieldset>

                                {locationDraft.hoursMode === "uniform" ? (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <label className="block text-sm">
                                            <span className="mb-1 block">Opens at*</span>
                                            <input
                                                type="time"
                                                className="w-full rounded-md border px-3 py-2"
                                                value={locationDraft.opens_at}
                                                onChange={(e) => updateLocationDraft({ opens_at: e.target.value })}
                                                disabled={!canEdit}
                                                required
                                            />
                                        </label>
                                        <label className="block text-sm">
                                            <span className="mb-1 block">Closes at*</span>
                                            <input
                                                type="time"
                                                className="w-full rounded-md border px-3 py-2"
                                                value={locationDraft.closes_at}
                                                onChange={(e) => updateLocationDraft({ closes_at: e.target.value })}
                                                disabled={!canEdit}
                                                required
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border">
                                        {weekdayOrder.map((day, idx) => {
                                            const entry = locationDraft.perDayHours[day];
                                            return (
                                                <div
                                                    key={day}
                                                    className={`flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center ${
                                                        idx !== weekdayOrder.length - 1 ? "border-b" : ""
                                                    }`}
                                                >
                                                    <div className="flex w-full items-center justify-between gap-3 sm:w-40">
                                                        <span className="text-sm font-medium text-slate-800">{weekdayLabels[day]}</span>
                                                        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                                            <input
                                                                type="checkbox"
                                                                checked={entry.closed}
                                                                disabled={!canEdit}
                                                                onChange={(e) => updatePerDayHours(day, { closed: e.target.checked })}
                                                            />
                                                            Closed
                                                        </label>
                                                    </div>
                                                    <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                                                        <label className="flex w-full flex-col text-xs font-medium sm:text-sm">
                                                            <span className="mb-1">Opens</span>
                                                            <input
                                                                type="time"
                                                                className="w-full rounded-md border px-3 py-2"
                                                                value={entry.opens_at}
                                                                disabled={entry.closed || !canEdit}
                                                                onChange={(e) => updatePerDayHours(day, { opens_at: e.target.value })}
                                                                required={!entry.closed}
                                                            />
                                                        </label>
                                                        <label className="flex w-full flex-col text-xs font-medium sm:text-sm">
                                                            <span className="mb-1">Closes</span>
                                                            <input
                                                                type="time"
                                                                className="w-full rounded-md border px-3 py-2"
                                                                value={entry.closes_at}
                                                                disabled={entry.closed || !canEdit}
                                                                onChange={(e) => updatePerDayHours(day, { closes_at: e.target.value })}
                                                                required={!entry.closed}
                                                            />
                                                        </label>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <p className="px-3 py-2 text-xs text-slate-500">Closed days are excluded from scheduling defaults.</p>
                                    </div>
                                )}

                                {locationDraft.err && <p className="text-sm text-red-600">{locationDraft.err}</p>}

                                <button
                                    type="submit"
                                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                                    disabled={!canEdit || locationDraft.busy}
                                >
                                    {locationDraft.busy ? "Saving…" : "Save location"}
                                </button>
                            </form>
                        )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <button
                            type="button"
                            className="flex w-full items-center justify-between text-left"
                            onClick={() => setRoleFormOpen((prev) => !prev)}
                        >
                            <div>
                                <p className="text-base font-semibold text-slate-900">Add Role</p>
                                <p className="text-xs text-slate-500">Define roles and descriptions before invites go out.</p>
                            </div>
                            <ChevronDown
                                className={`h-5 w-5 text-slate-500 transition-transform ${roleFormOpen ? "rotate-180" : ""}`}
                            />
                        </button>

                        {roleFormOpen && (
                            <form className="mt-4 space-y-3" onSubmit={handleRoleSubmit}>
                                <label className="block text-sm">
                                    <span className="mb-1 block">Role name*</span>
                                    <input
                                        className="w-full rounded-md border px-3 py-2"
                                        value={roleForm.name}
                                        onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                                        disabled={!canEdit}
                                        required
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-1 block">Color (hex)*</span>
                                    <input
                                        className="w-full rounded-md border px-3 py-2"
                                        value={roleForm.color}
                                        onChange={(e) => setRoleForm((prev) => ({ ...prev, color: e.target.value }))}
                                        disabled={!canEdit}
                                        placeholder="#2DD4BF"
                                        required
                                    />
                                </label>

                                <label className="block text-sm">
                                    <span className="mb-1 block">Description*</span>
                                    <textarea
                                        className="h-24 w-full rounded-md border px-3 py-2"
                                        value={roleForm.description}
                                        onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))}
                                        disabled={!canEdit}
                                        placeholder="Brief description of the role"
                                        required
                                    />
                                </label>

                                {roleErr && <p className="text-sm text-red-600">{roleErr}</p>}

                                <button
                                    type="submit"
                                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                                    disabled={!canEdit}
                                >
                                    Add role
                                </button>
                            </form>
                        )}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <h3 className="text-base font-semibold text-slate-900">Existing roles</h3>
                        <div className="mt-3 space-y-3">
                            {roles.length === 0 ? (
                                <p className="text-sm text-slate-500">No roles yet.</p>
                            ) : (
                                roles.map((role) => (
                                    <RoleItem
                                        key={role.id}
                                        role={role}
                                        disabled={!canEdit}
                                        onSave={(patch) => updateRole(role.id, patch)}
                                        onDelete={() => deleteRole(role.id)}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="button"
                            className="rounded border px-4 py-2 text-sm"
                            onClick={() => router.push("/employeronboarding/business-selection")}
                        >
                            Back to businesses
                        </button>
                        <button
                            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                            onClick={() => router.push(`/employeronboarding/team/${businessId}`)}
                            disabled={!isUUID(businessId)}
                        >
                            Continue to invites
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RoleItem(props: {
    role: RoleRow;
    disabled: boolean;
    onSave: (patch: Partial<RoleRow>) => void;
    onDelete: () => void;
}) {
    const { role, disabled, onSave, onDelete } = props;
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(role.name);
    const [color, setColor] = useState(role.color ?? "");
    const [description, setDescription] = useState(role.description ?? "");

    const save = () => {
        const patch: Partial<RoleRow> = {
            name: name.trim(),
            color: color ? (color.startsWith("#") ? color : `#${color}`) : null,
            description: description ? description.trim() : null,
        };
        onSave(patch);
        setEditing(false);
    };

    return (
        <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
                {!editing ? (
                    <>
                        <p className="truncate text-sm font-medium text-slate-900">{role.name}</p>
                        <p className="truncate text-xs text-slate-500">
                            {(role.color ?? "no color").toUpperCase()} · {role.description || "No description"}
                        </p>
                    </>
                ) : (
                    <div className="space-y-2">
                        <input
                            className="w-full rounded-md border px-3 py-2"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={disabled}
                        />
                        <input
                            className="w-full rounded-md border px-3 py-2"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            disabled={disabled}
                        />
                        <textarea
                            className="h-20 w-full rounded-md border px-3 py-2"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={disabled}
                        />
                    </div>
                )}
            </div>
            <div className="flex gap-2">
                {editing ? (
                    <>
                        <button
                            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                            onClick={save}
                            disabled={disabled}
                        >
                            Save
                        </button>
                        <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setEditing(false)}>
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => setEditing(true)}
                            disabled={disabled}
                        >
                            Edit
                        </button>
                        <button
                            className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={onDelete}
                            disabled={disabled}
                        >
                            Delete
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
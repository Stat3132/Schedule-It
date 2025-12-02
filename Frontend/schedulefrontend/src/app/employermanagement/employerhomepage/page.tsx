// app/employermanagement/employerhomepage/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Announcement } from "../../../lib/supabase";
import { AttachmentPreview } from "../../../components/messages/AttachmentPreview";
import {
  normalizeAnnouncementRow,
  markAnnouncementsAsRead,
  type AnnouncementRow,
} from "../../../lib/announcements";

/* ---------- Types ---------- */
type EmploymentRow = {
  business_id: string;
  is_manager: boolean | null;
  is_admin: boolean | null;
  status: string | null;
  user_id?: string | null;
  location_id?: string | null;
};

type ShiftRow = {
  id: string;
  business_id: string | null;
  location_id: string | null;
  role_id: string | null;
  start_ts: string;
  end_ts: string;
  status: "draft" | "published" | "canceled";
};

type AssignmentRow = {
  id: string;
  shift_id: string;
  user_id: string;
  status: "assigned" | "offered" | "accepted" | "declined" | "dropped";
  source: "manager" | "autofill" | "swap";
};

type ProfileRow = { id: string; full_name: string | null };
type BusinessOpt = { id: string; name: string | null };
type LocationOpt = { id: string; name: string };

type TORow = {
  id: string;
  user_id: string;
  start_ts: string;
  end_ts: string;
  reason?: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
};

type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type AvailabilityStatus = "available" | "partial" | "unavailable";

type AvailabilityRow = {
  id: string;
  user_id: string;
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
  status?: string | null;
};

type AvailabilityPattern = Record<DayOfWeek, AvailabilityStatus>;

const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_KEYS: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type AvailabilityWindow = {
  start: Date;
  end: Date | null;
  pattern: AvailabilityPattern;
};

type DayCell = {
  start?: string;
  end?: string;
  timeOffStatus?: TORow["status"];
  unavailable?: boolean;
  isDropPending?: boolean;
  isPickedUp?: boolean;
};

type GridRow = { userId: string; name: string; byDay: DayCell[] };

/* ---------- Date helpers ---------- */
function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(d.getDate() - diff);
  return out;
}

function endOfWeek(d: Date, weekStartsOn: 0 | 1 = 0) {
  const s = startOfWeek(d, weekStartsOn);
  const out = new Date(s);
  out.setDate(s.getDate() + 7);
  out.setMilliseconds(-1);
  return out;
}

function fmtDateMMDD(d: Date) {
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${mm}/${dd}`;
}

function normalizeToLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAvailabilityPattern(raw: unknown): AvailabilityPattern {
  let src: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.pattern && typeof r.pattern === "object" && r.pattern !== null) {
      src = r.pattern as Record<string, unknown>;
    } else {
      src = r;
    }
  }

  const out: Partial<AvailabilityPattern> = {};
  for (const day of ALL_DAYS) {
    const v = src[day];
    if (v === "available" || v === "partial" || v === "unavailable") {
      out[day] = v as AvailabilityStatus;
    } else {
      out[day] = "available";
    }
  }
  return out as AvailabilityPattern;
}

/* ---------- Component ---------- */
export default function EmployerHomePage() {
  const supabase = useRef(createClientComponentClient()).current;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Announcement popup state (initial announcement on first login)
  const [announcementToShow, setAnnouncementToShow] = useState<Announcement | null>(null);
  const [announcementSender, setAnnouncementSender] = useState<string | null>(null);

  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);

  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | "ALL">("ALL");

  const [weekLabel, setWeekLabel] = useState("");
  const [days, setDays] = useState<{ label: string; date: string }[]>([]);
  const [grid, setGrid] = useState<GridRow[]>([]);

  /* ---------- Seed selection from localStorage ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBiz = localStorage.getItem("activeBusinessId");
    const storedLocsRaw = localStorage.getItem("activeLocationIds");
    const storedLocs = storedLocsRaw
      ? (JSON.parse(storedLocsRaw) as string[])
      : [];

    if (storedBiz) setSelectedBiz(storedBiz);
    if (storedLocs[0]) setSelectedLoc(storedLocs[0]);
  }, []);

  /* ---------- Bootstrap: discover accessible businesses ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();

      if (uErr || !user) {
        if (!cancelled) {
          setLoading(false);
          setErrorMsg("No session. Please sign in.");
        }
        return;
      }

      const { data: empData, error: empError } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("status", "active")
        .or("is_manager.eq.true,is_admin.eq.true");

      if (empError) {
        if (!cancelled) {
          setLoading(false);
          setErrorMsg(`Employment bootstrap failed: ${empError.message}`);
        }
        return;
      }

      const mgrIds = Array.from(
        new Set(
          (empData ?? [])
            .filter((e: EmploymentRow) => e.is_manager || e.is_admin)
            .map((e: EmploymentRow) => e.business_id),
        ),
      );

      const { data: ownedRows, error: ownedErr } = await supabase
        .from("business")
        .select("id,name")
        .eq("owner_user_id", user.id);

      if (ownedErr) {
        console.warn("Owned business query error:", ownedErr.message);
      }

      const owned = (ownedRows ?? []) as { id: string; name: string | null }[];
      const idSet = new Set<string>(mgrIds);
      for (const b of owned) idSet.add(b.id);
      const idList = Array.from(idSet);

      let named: BusinessOpt[] = owned.map((r) => ({ id: r.id, name: r.name }));
      const needNames = idList.filter((id) => !owned.find((o) => o.id === id));

      if (needNames.length) {
        const { data: bRows } = await supabase
          .from("business")
          .select("id,name")
          .in("id", needNames);

        const extra = (bRows ?? []).map(
          (r: { id: string; name: string | null }) => ({
            id: r.id,
            name: r.name ?? null,
          }),
        );

        const existingIds = new Set(named.map((x) => x.id));
        named = named.concat(extra.filter((e) => !existingIds.has(e.id)));

        for (const id of needNames) {
          if (!named.find((n) => n.id === id)) named.push({ id, name: null });
        }
      }

      if (!cancelled) {
        setBusinesses(named);
        if (!selectedBiz && idList.length > 0) {
          setSelectedBiz(idList[0]);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Show the most recent unseen announcement for employer on homepage load
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Determine business ids this manager/admin has access to
        const bizIds = businesses.map((b) => b.id);

        // Load roles for these businesses
        let roleIds: string[] = [];
        if (bizIds.length) {
          const { data: roles } = await supabase
            .from("role")
            .select("id")
            .in("business_id", bizIds);
          if (roles && Array.isArray(roles))
            roleIds = (roles as unknown[])
              .map((r) => {
                if (r && typeof r === "object" && "id" in r) {
                  const rec = r as Record<string, unknown>;
                  if (typeof rec.id === "string") return rec.id;
                }
                return "";
              })
              .filter(Boolean) as string[];
        }

        // Load announcements ordered most-recent-first
        const { data: annRows, error: annErr } = await supabase
          .from("announcements")
          .select(
            "id,title,content,created_at,created_by,target_role_ids,target_recipient_emails,target_recipient_display_names,attachment_url,attachment_name,attachment_mime,attachment_size,attachment_path",
          )
          .order("created_at", { ascending: false });

        if (annErr) {
          console.error("[EmployerHome] load announcements error", annErr);
          return;
        }
        if (!annRows || annRows.length === 0) return;

        const normalized = (annRows as AnnouncementRow[]).map(normalizeAnnouncementRow);
        const userEmailLower = user.email ? user.email.toLowerCase() : null;
        const applicable = normalized.filter((announcement) => {
          if (announcement.created_by === user.id) return false;
          const hasRoleTargets = announcement.target_role_ids.length > 0;
          const hasRecipientTargets = announcement.target_recipients.length > 0;
          const matchesRole =
            hasRoleTargets && roleIds.length
              ? announcement.target_role_ids.some((t) => roleIds.includes(t))
              : false;
          const matchesRecipient =
            hasRecipientTargets && userEmailLower
              ? announcement.target_recipients.some(
                  (recipient) =>
                    recipient.email &&
                    recipient.email.toLowerCase() === userEmailLower,
                )
              : false;

          if (!hasRoleTargets && !hasRecipientTargets) return true;
          if (matchesRole) return true;
          if (matchesRecipient) return true;
          return false;
        });

        if (applicable.length === 0) return;

        const applicableIds = applicable.map((a) => a.id);
        let readIds = new Set<string>();
        if (applicableIds.length) {
          const { data: receipts, error: receiptErr } = await supabase
            .from("announcement_receipt")
            .select("announcement_id")
            .eq("user_id", user.id)
            .in("announcement_id", applicableIds);
          if (receiptErr) {
            console.error("[EmployerHome] load announcement receipts error", receiptErr);
          } else {
            readIds = new Set(
              (receipts ?? []).map((r) => r.announcement_id as string),
            );
          }
        }

        const firstUnseen = applicable.find((a) => !readIds.has(a.id));
        if (!firstUnseen) return;

        await markAnnouncementsAsRead(supabase, user.id, [firstUnseen.id]);

        // Resolve sender name
        const creatorId = firstUnseen.created_by;
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name,display_name,email")
          .eq("id", creatorId)
          .maybeSingle();

        let senderName = "Manager";
        if (prof && typeof prof === "object") {
          const p = prof as Record<string, unknown>;
          if (typeof p.full_name === "string" && p.full_name.trim()) senderName = p.full_name;
          else if (typeof p.display_name === "string" && p.display_name.trim()) senderName = p.display_name;
          else if (typeof p.email === "string" && p.email.trim()) senderName = p.email;
        }
        // Show the announcement and mark sender
        setAnnouncementToShow(firstUnseen);
        setAnnouncementSender(senderName);
      } catch (e) {
        console.error("Error checking announcements for employer:", e);
      }
    })();
    // run when businesses list or supabase ref changes
  }, [businesses, supabase]);

  /* ---------- Persist selection ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBiz) {
      localStorage.setItem("activeBusinessId", selectedBiz);
    }
  }, [selectedBiz]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedLoc && selectedLoc !== "ALL") {
      localStorage.setItem("activeLocationIds", JSON.stringify([selectedLoc]));
    } else {
      localStorage.removeItem("activeLocationIds");
    }
  }, [selectedLoc]);

  /* ---------- Load locations ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!selectedBiz) {
        setLocations([]);
        setSelectedLoc("ALL");
        return;
      }

      const { data, error } = await supabase
        .from("location")
        .select("id,name")
        .eq("business_id", selectedBiz);

      if (cancelled) return;

      if (error) {
        setErrorMsg(`Location query failed: ${error.message}`);
        setLocations([]);
        setSelectedLoc("ALL");
        return;
      }

      const locs = (data ?? []) as LocationOpt[];
      setLocations(locs);

      if (selectedLoc !== "ALL" && !locs.find((l) => l.id === selectedLoc)) {
        setSelectedLoc("ALL");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedBiz, selectedLoc, supabase]);

  /* ---------- Load weekly grid ---------- */
  const scopeKey = useMemo(
    () => `${selectedBiz ?? ""}|${selectedLoc}`,
    [selectedBiz, selectedLoc],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg(null);
      setGrid([]);
      setDays([]);
      setWeekLabel("");

      if (!selectedBiz) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const ws = startOfWeek(now, 0);
      const we = endOfWeek(now, 0);

      const labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        return {
          label: d.toLocaleDateString([], { weekday: "long" }),
          date: fmtDateMMDD(d),
        };
      });

      const weekStartISO = ws.toISOString();
      const weekEndISO = we.toISOString();

      const header = `Week of ${ws.toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })} - ${new Date(
        ws.getFullYear(),
        ws.getMonth(),
        ws.getDate() + 6,
      ).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;

      let empQ = supabase
        .from("employment")
        .select("user_id,location_id,status")
        .eq("business_id", selectedBiz)
        .eq("status", "active");

      if (selectedLoc !== "ALL") {
        empQ = empQ.or(`location_id.is.null,location_id.eq.${selectedLoc}`);
      }

      const { data: empRows, error: empErr } = await empQ;

      if (empErr) {
        if (!cancelled) {
          setErrorMsg(`Employment query failed: ${empErr.message}`);
          setDays(labels);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }

      const employeeIds = Array.from(
        new Set(
          (empRows ?? [])
            .map((e: { user_id?: string | null }) => e.user_id)
            .filter(Boolean) as string[],
        ),
      );

      let nameById = new Map<string, string>();
      if (employeeIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", employeeIds);

        if (profErr) {
          if (!cancelled) {
            setErrorMsg(`Profile query failed: ${profErr.message}`);
            setDays(labels);
            setWeekLabel(header);
            setLoading(false);
          }
          return;
        }

        nameById = new Map<string, string>(
          (profs as ProfileRow[]).map((p) => [p.id, p.full_name ?? ""]),
        );
      }

      let shiftQ = supabase
        .from("shift")
        .select("id,business_id,location_id,role_id,start_ts,end_ts,status")
        .eq("business_id", selectedBiz)
        .neq("status", "canceled")
        .gte("start_ts", ws.toISOString())
        .lt("start_ts", we.toISOString());

      if (selectedLoc !== "ALL") {
        shiftQ = shiftQ.eq("location_id", selectedLoc);
      }

      const { data: shifts, error: shErr } = await shiftQ;

      if (shErr) {
        if (!cancelled) {
          setErrorMsg(`Shift query failed: ${shErr.message}`);
          setDays(labels);
          setWeekLabel(header);
          setLoading(false);
        }
        return;
      }

      const safeShifts: ShiftRow[] = Array.isArray(shifts)
        ? (shifts as ShiftRow[])
        : [];
      const shiftIds = safeShifts.map((s) => s.id);

      let assigns: AssignmentRow[] = [];
      if (shiftIds.length && employeeIds.length) {
        const { data: assignsRaw, error: asErr } = await supabase
          .from("shift_assignment")
          .select("id,shift_id,user_id,status,source")
          .in("shift_id", shiftIds)
          .in("user_id", employeeIds);

        if (asErr) {
          if (!cancelled) {
            setErrorMsg(`Assignment query failed: ${asErr.message}`);
            setDays(labels);
            setWeekLabel(header);
            setLoading(false);
          }
          return;
        }

        assigns = ((assignsRaw ?? []) as AssignmentRow[]).filter(
          (a) => a.status !== "declined",
        );
      }

      const timeOffByUserDay = new Map<string, Map<string, TORow["status"]>>();
      if (employeeIds.length) {
        const { data: torRaw, error: torErr } = await supabase
          .from("time_off_request")
          .select("id,user_id,start_ts,end_ts,status")
          .in("user_id", employeeIds)
          .eq("status", "approved");

        if (torErr) {
          console.error("Time off query failed:", torErr);
        } else if (torRaw) {
          const rows = torRaw as TORow[];
          for (const r of rows) {
            const startLocal = normalizeToLocalDay(new Date(r.start_ts));
            const endExclusive = normalizeToLocalDay(new Date(r.end_ts));
            const lastIncluded = new Date(endExclusive.getTime() - 1);

            for (
              let d = new Date(startLocal);
              d <= lastIncluded;
              d.setDate(d.getDate() + 1)
            ) {
              const ymd = toYMD(d);
              const existing = timeOffByUserDay.get(r.user_id) ?? new Map();
              existing.set(ymd, r.status);
              timeOffByUserDay.set(r.user_id, existing);
            }
          }
        }
      }

      const availabilityWindowsByUser = new Map<string, AvailabilityWindow[]>();
      if (employeeIds.length) {
        const { data: avRaw, error: avErr } = await supabase
          .from("availability")
          .select(
            "id,user_id,weekly_pattern_json,effective_from,effective_to,status",
          )
          .in("user_id", employeeIds)
          .eq("status", "approved")
          .lte("effective_from", weekEndISO)
          .or(`effective_to.is.null,effective_to.gte.${weekStartISO}`)
          .order("effective_from", { ascending: false });

        if (avErr) {
          console.error("Availability query failed:", avErr);
        } else if (avRaw) {
          const rows = avRaw as AvailabilityRow[];
          const byUser: Record<string, AvailabilityWindow[]> = {};
          for (const r of rows) {
            const start = normalizeToLocalDay(new Date(r.effective_from));
            if (Number.isNaN(start.getTime())) continue;
            const end = r.effective_to
              ? normalizeToLocalDay(new Date(r.effective_to))
              : null;
            const entry: AvailabilityWindow = {
              start,
              end,
              pattern: normalizeAvailabilityPattern(r.weekly_pattern_json),
            };
            if (!byUser[r.user_id]) byUser[r.user_id] = [];
            byUser[r.user_id].push(entry);
          }
          for (const uid of Object.keys(byUser)) {
            const windows = byUser[uid].sort(
              (a, b) => b.start.getTime() - a.start.getTime(),
            );
            availabilityWindowsByUser.set(uid, windows);
          }
        }
      }

      const byUser = new Map<string, GridRow>();
      for (const uid of employeeIds) {
        byUser.set(uid, {
          userId: uid,
          name: nameById.get(uid) ?? uid,
          byDay: Array.from({ length: 7 }, () => ({} as DayCell)),
        });
      }

      for (const a of assigns) {
        const sh = safeShifts.find((s) => s.id === a.shift_id);
        if (!sh) continue;

        const dow = new Date(sh.start_ts).getDay();
        const rec = byUser.get(a.user_id);
        if (!rec) continue;

        const baseCell: DayCell = {
          ...(rec.byDay[dow] ?? {}),
          start: new Date(sh.start_ts).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
          end: new Date(sh.end_ts).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        };

        if (a.status === "dropped") {
          baseCell.isDropPending = true;
        } else if (a.source === "swap") {
          baseCell.isPickedUp = true;
        }

        rec.byDay[dow] = baseCell;
      }

      for (const uid of employeeIds) {
        const row = byUser.get(uid);
        if (!row) continue;

        const availabilityWindows = availabilityWindowsByUser.get(uid) ?? null;
        const torMap = timeOffByUserDay.get(uid);

        for (let i = 0; i < 7; i++) {
          const date = new Date(ws);
          date.setDate(ws.getDate() + i);
          const dayStart = normalizeToLocalDay(date);
          const ymd = toYMD(date);
          const cell = row.byDay[i] || ({} as DayCell);

          if (torMap) {
            const status = torMap.get(ymd);
            if (status) {
              cell.timeOffStatus = status;
            }
          }

          if (availabilityWindows && availabilityWindows.length) {
            const windowForDay = availabilityWindows.find((window) => {
              if (window.start.getTime() > dayStart.getTime()) return false;
              if (window.end && window.end.getTime() < dayStart.getTime()) {
                return false;
              }
              return true;
            });

            if (windowForDay) {
              const dayKey = DAY_KEYS[i];
              if (windowForDay.pattern[dayKey] === "unavailable") {
                cell.unavailable = true;
              }
            }
          }

          row.byDay[i] = cell;
        }
      }

      if (!cancelled) {
        setDays(labels);
        setGrid(Array.from(byUser.values()));
        setWeekLabel(header);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scopeKey, supabase, selectedBiz, selectedLoc]);

  /* ---------- Derived ---------- */
  const bizName = useMemo(() => {
    const found = businesses.find((b) => b.id === selectedBiz);
    return found?.name ?? (selectedBiz ? selectedBiz.slice(0, 8) + "…" : "");
  }, [businesses, selectedBiz]);

  /* ---------- Early outs ---------- */
  if (loading && !businesses.length) return <div className="p-6">Loading…</div>;

  if (!businesses.length)
    return (
      <div className="p-6">
        No manager access found for your user.
        <div className="mt-2 text-sm text-foreground/70">
          Ensure you either own a business or have an active employment with
          manager/admin rights.
        </div>
      </div>
    );

  /* ---------- Main content ---------- */
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Weekly Schedule</h1>
        <p className="text-foreground/70 mt-1">
          {bizName} · {selectedLoc === "ALL" ? "All locations" : "One location"}
        </p>
        <p className="text-foreground/70">{weekLabel}</p>
        {errorMsg && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{errorMsg}</p>}
      </div>

      {/* Scope controls */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
          <div className="space-y-1">
          <div className="text-xs font-medium text-foreground/60 uppercase tracking-wide">
            Business
          </div>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-background text-foreground"
            value={selectedBiz ?? ""}
            onChange={(e) => setSelectedBiz(e.target.value || null)}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? b.id}
              </option>
            ))}
          </select>
        </div>

          <div className="space-y-1">
          <div className="text-xs font-medium text-foreground/60 uppercase tracking-wide">
            Location
          </div>
          <select
            className="border rounded-md px-2 py-1 text-sm bg-background text-foreground"
            value={selectedLoc}
            onChange={(e) =>
              setSelectedLoc((e.target.value as string) || "ALL")
            }
            disabled={!selectedBiz}
          >
            <option value="ALL">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Full-width schedule card */}
      <div className="bg-background rounded-xl shadow-sm border border-border w-full">
        {loading ? (
          <div className="p-6">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="px-6 py-4 text-left">
                  <div className="text-sm font-semibold text-foreground">
                    Staff Member
                  </div>
                  <div className="text-xs text-foreground/60">
                    {selectedLoc === "ALL"
                      ? "Business scope"
                      : "Business + Location scope"}
                  </div>
                </th>
                {days.map((d) => (
                  <th
                    key={d.label}
                    className="px-3 py-4 text-center min-w-[110px]"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {d.label}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">
                      {d.date}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {grid.map((row) => (
                <tr
                  key={row.userId}
                  className="border-b border-border hover:bg-background/50"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-foreground">
                      {row.name || row.userId}
                    </div>
                  </td>
                  {row.byDay.map((cell, idx) => (
                    <td key={idx} className="px-3 py-4 text-center">
                        {cell.start ? (
                        <div className="border rounded-lg p-2 border-border bg-background">
                          <div className="text-xs font-semibold text-foreground">
                            {cell.start}
                          </div>
                          <div className="text-xs text-foreground">{cell.end}</div>
                          {(cell.timeOffStatus ||
                            cell.unavailable ||
                            cell.isDropPending ||
                            cell.isPickedUp) && (
                            <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                              {(() => {
                                const parts: string[] = [];
                                if (cell.timeOffStatus) {
                                  parts.push(
                                    cell.timeOffStatus === "pending"
                                      ? "Time off requested (pending)"
                                      : "Time off approved",
                                  );
                                }
                                if (cell.unavailable) {
                                  parts.push("Marked unavailable");
                                }
                                if (cell.isDropPending) {
                                  parts.push("Drop requested (pending review)");
                                } else if (cell.isPickedUp) {
                                  parts.push("Picked up shift");
                                }
                                return parts.join(" • ");
                              })()}
                            </div>
                          )}
                        </div>
                      ) : cell.timeOffStatus ? (
                        <div className="border border-amber-200 bg-amber-50 rounded-lg p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
                          {cell.timeOffStatus === "pending"
                            ? "Time off requested (pending)"
                            : "Time off approved"}
                        </div>
                      ) : cell.unavailable ? (
                        <div className="border border-border bg-background rounded-lg p-2 text-xs text-foreground/70">
                          Unavailable
                        </div>
                      ) : (
                        <div className="text-xs text-foreground/60 py-2">Off</div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {grid.length === 0 && (
                <tr>
                  <td
                    className="px-6 py-8 text-sm text-foreground/60"
                    colSpan={1 + days.length}
                  >
                    No employees or no shifts for this week and scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Announcement popup (initial only) */}
        {announcementToShow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400 mb-1">
                  New announcement
                </p>
                <h2 className="text-lg font-semibold text-foreground">
                  {announcementToShow.title}
                </h2>
                <p className="mt-1 text-sm text-foreground/70">
                  From {announcementSender ?? "Manager"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAnnouncementToShow(null);
                }}
                className="text-foreground/70 hover:text-foreground"
              >
                <span className="sr-only">Close</span>
                ×
              </button>
            </div>
            <div className="mt-4 text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">
              {announcementToShow.content}
              {announcementToShow.attachment && (
                <AttachmentPreview
                  url={announcementToShow.attachment.url}
                  name={announcementToShow.attachment.name}
                  mime={announcementToShow.attachment.mime}
                  size={announcementToShow.attachment.size}
                  downloadLabel="View attachment"
                />
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setAnnouncementToShow(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

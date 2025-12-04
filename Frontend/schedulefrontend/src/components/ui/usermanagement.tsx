"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestError } from "@supabase/supabase-js";
import { Check, X, Loader2, UserX } from "lucide-react";
import Image from "next/image";

type UUID = string;

type Business = {
  id: UUID;
  name: string;
  verification_status: "unverified" | "docs_submitted" | "verified" | "rejected";
  owner_user_id: UUID | null;
};

type Role = { id: UUID; business_id: UUID; name: string; color: string | null };
type Location = { id: UUID; business_id: UUID; name: string; address: string | null };

type Invite = {
  id: UUID;
  business_id: UUID;
  email: string;
  role_id: UUID | null;
  location_id: UUID | null;
  is_manager: boolean;
  is_admin: boolean;
  token: UUID;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by: UUID | null;
  invited_at: string | null;
  accepted_at?: string | null;
};

type Employment = {
  id: UUID;
  user_id: UUID;
  business_id: UUID;
  location_id: UUID | null;
  role_id: UUID | null;
  status: "invited" | "active" | "inactive" | "terminated";
  is_manager: boolean;
  is_admin: boolean;
  permissions: Record<string, unknown> | null;
  pay_rate: number | null;
  hire_date: string | null;
  terminated_at: string | null;
};

type CoworkerProfile = {
  id: UUID;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  display_name: string | null;
  photo_url: string | null;
};

type EmploymentWithProfile = Employment & {
  profile: CoworkerProfile | null;
  allowedLocations: UUID[];
  roleIds: UUID[];
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

type AvailabilityPattern = Record<DayOfWeek, AvailabilityStatus>;

type AvailabilityRow = {
  user_id: UUID;
  weekly_pattern_json: unknown;
  effective_from: string;
  effective_to: string | null;
};

type AvailabilitySummary = {
  pattern: AvailabilityPattern;
  effectiveFrom: string;
  effectiveTo: string | null;
  isFuture: boolean;
};

type RosterDraft = {
  primaryRoleId: UUID | "";
  roleIds: UUID[];
  primaryLocationId: UUID | "";
  allowedLocations: UUID[];
  isManager: boolean;
  isAdmin: boolean;
  payRate: string;
  hireDate: string;
  fullName: string;
  displayName: string;
};

type JoinRequest = {
  id: UUID;
  business_id: UUID;
  requester_user_id: UUID;
  requested_role_id: UUID | null;
  requested_location_id: UUID | null;
  message: string | null;
  status: "pending" | "approved" | "denied" | "canceled";
  created_at: string;
  requester_profile?: CoworkerProfile | null;
};

type InviteResult = {
  email: string;
  joinUrl: string;
  emailed: boolean;
  error?: string;
};

type Props = { businessId: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const STATUS_BADGE: Record<Employment["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  inactive: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  invited: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  terminated: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
};

const AVAILABILITY_BADGE: Record<AvailabilityStatus, string> = {
  available: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
  unavailable: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-100",
};

const AVAILABILITY_STATUS_LABEL: Record<AvailabilityStatus, string> = {
  available: "Available",
  partial: "Partial",
  unavailable: "Unavailable",
};

const AVAILABILITY_DAY_ORDER: { key: DayOfWeek; label: string }[] = [
  { key: "sunday", label: "Sun" },
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
];

const DEFAULT_AVAILABILITY_PATTERN: AvailabilityPattern = {
  sunday: "available",
  monday: "available",
  tuesday: "available",
  wednesday: "available",
  thursday: "available",
  friday: "available",
  saturday: "available",
};

function buildRosterDraft(row: EmploymentWithProfile): RosterDraft {
  const roleIds = row.roleIds.length ? row.roleIds : row.role_id ? [row.role_id] : [];
  return {
    primaryRoleId: row.role_id ?? "",
    roleIds: [...roleIds],
    primaryLocationId: row.location_id ?? "",
    allowedLocations: [...(row.allowedLocations ?? [])],
    isManager: row.is_manager,
    isAdmin: row.is_admin,
    payRate: formatPayRateFromNumber(row.pay_rate),
    hireDate: row.hire_date ?? "",
    fullName: row.profile?.full_name ?? "",
    displayName: row.profile?.display_name ?? "",
  };
}

function namesMatch(a?: string | null, b?: string | null) {
  return (a ?? "").trim() === (b ?? "").trim();
}

function arraysMatch(a: UUID[], b: UUID[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

function normalizeRoleSelection(roleIds: UUID[], primaryRoleId: UUID | "") {
  const deduped = Array.from(new Set(roleIds.filter((val): val is UUID => Boolean(val))));
  if (primaryRoleId && !deduped.includes(primaryRoleId)) {
    deduped.unshift(primaryRoleId);
  }
  return deduped;
}

function rosterRowHasChanges(row: EmploymentWithProfile, draft: RosterDraft) {
  if (!draft) return false;
  if ((draft.primaryRoleId || "") !== (row.role_id ?? "")) return true;
  const normalizedRoles = normalizeRoleSelection(draft.roleIds, draft.primaryRoleId);
  if (!arraysMatch(normalizedRoles, row.roleIds ?? [])) return true;
  if ((draft.primaryLocationId || "") !== (row.location_id ?? "")) return true;
  if (draft.isManager !== row.is_manager) return true;
  if (draft.isAdmin !== row.is_admin) return true;
  if (!arraysMatch(draft.allowedLocations, row.allowedLocations ?? [])) return true;
  if ((draft.payRate || "") !== formatPayRateFromNumber(row.pay_rate)) return true;
  if ((draft.hireDate || "") !== (row.hire_date ?? "")) return true;
  if (!namesMatch(draft.fullName, row.profile?.full_name)) return true;
  if (!namesMatch(draft.displayName, row.profile?.display_name)) return true;
  return false;
}

function profileInitials(profile: CoworkerProfile | null) {
  const source = (profile?.display_name || profile?.full_name || profile?.email || "User").trim();
  const parts = source.split(/\s+/).slice(0, 2);
  const chars = parts.map(p => (p[0] ?? "").toUpperCase()).join("");
  return chars || "U";
}

function formatDateShort(iso: string | null) {
  if (!iso) return null;
  const [ymd] = iso.split("T");
  const [y, m, d] = ymd.split("-");
  const year = Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  if (!year || month < 0 || !day) return null;

  const date = new Date(year, month, day);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatDisplayDate(iso: string | null) {
  if (!iso) return null;
  return formatDateShort(iso) ?? iso.split("T")[0] ?? iso;
}

function normalizeToLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

  const defaults: AvailabilityPattern = {
    sunday: "available",
    monday: "available",
    tuesday: "available",
    wednesday: "available",
    thursday: "available",
    friday: "available",
    saturday: "available",
  };

  for (const key of Object.keys(defaults) as DayOfWeek[]) {
    const value = src[key];
    if (value === "available" || value === "partial" || value === "unavailable") {
      defaults[key] = value;
    }
  }

  return defaults;
}
const ROSTER_PAGE_SIZE = 8;

function formatPayRateFromNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  const normalized = Math.round(value * 100) / 100;
  return normalized.toFixed(2);
}

function sanitizePayRateInput(raw: string) {
  if (!raw) return "";
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot + 1);
  const decimals = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}${decimals}`;
}

function formatPayRateString(raw: string) {
  if (!raw.trim()) return "";
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return "";
  return (Math.round(parsed * 100) / 100).toFixed(2);
}

function parsePayRateNumber(raw: string) {
  if (!raw.trim()) return null;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function parseEmails(raw: string): string[] {
  const emails = raw
    .split(/[\s,;]+/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    if (!seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

export default function UserManagement({ businessId }: Props) {
  const supabase = createClientComponentClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [biz, setBiz] = useState<Business | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [pendingEmps, setPendingEmps] = useState<EmploymentWithProfile[]>([]);
  const [joinRequests, setJoinRequests] = useState<(JoinRequest & { profile: CoworkerProfile | null })[]>([]);
  const [roster, setRoster] = useState<EmploymentWithProfile[]>([]);
  const [rosterDrafts, setRosterDrafts] = useState<Record<string, RosterDraft>>({});
  const [rosterSaving, setRosterSaving] = useState<Record<string, boolean>>({});
  const [terminateTarget, setTerminateTarget] = useState<EmploymentWithProfile | null>(null);
  const [terminateReason, setTerminateReason] = useState("");
  const [terminateBusy, setTerminateBusy] = useState(false);
  const [rosterSummary, setRosterSummary] = useState({ total: 0, invited: 0, active: 0, inactive: 0, terminated: 0 });
  const [rosterQuery, setRosterQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [currentUserId, setCurrentUserId] = useState<UUID | null>(null);
  const [rawInviteEmails, setRawInviteEmails] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<UUID | "">("");
  const [inviteLocationId, setInviteLocationId] = useState<UUID | "">("");
  const [inviteIsManager, setInviteIsManager] = useState(false);
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);
  const [availabilityByUser, setAvailabilityByUser] = useState<Record<string, AvailabilitySummary>>({});

  type AcceptTarget =
    | { kind: "invite"; invite: Invite }
    | { kind: "employment"; employment: EmploymentWithProfile }
    | { kind: "request"; request: JoinRequest & { profile: CoworkerProfile | null } }
    | null;

  const [openTarget, setOpenTarget] = useState<AcceptTarget>(null);
  const [formPrimaryRoleId, setFormPrimaryRoleId] = useState<UUID | "">("");
  const [formRoleIds, setFormRoleIds] = useState<UUID[]>([]);
  const [formIsMgr, setFormIsMgr] = useState(false);
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formAllowedLocs, setFormAllowedLocs] = useState<UUID[]>([]);
  const [formPrimaryLocId, setFormPrimaryLocId] = useState<UUID | "">("");

  function handlePrimaryRoleChange(value: UUID | "") {
    setFormPrimaryRoleId(value);
    if (value) {
      setFormRoleIds(prev => (prev.includes(value) ? prev : [...prev, value]));
    }
  }

  function toggleFormRole(roleId: UUID) {
    setFormRoleIds(prev => {
      const exists = prev.includes(roleId);
      const next = exists ? prev.filter(id => id !== roleId) : [...prev, roleId];
      setFormPrimaryRoleId(prevPrimary => {
        if (!exists && !prevPrimary) return roleId;
        if (exists && prevPrimary === roleId) return next[0] ?? "";
        return prevPrimary;
      });
      return next;
    });
  }

  const inviteEmails = useMemo(() => parseEmails(rawInviteEmails), [rawInviteEmails]);
  const verified = biz?.verification_status === "verified";
  const disabledUI = !verified;
  const isOwner = Boolean(biz?.owner_user_id && currentUserId && biz.owner_user_id === currentUserId);

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roles) {
      map.set(role.id, role.name);
    }
    return map;
  }, [roles]);

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.name);
    }
    return map;
  }, [locations]);

  const filteredRoster = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    if (!query) return roster;
    return roster.filter(row => {
      const roleName = row.role_id ? roleNameById.get(row.role_id) : "";
      const allRoleNames = row.roleIds
        .map(roleId => roleNameById.get(roleId) ?? "")
        .filter(Boolean)
        .join(" ");
      const locationName = row.location_id ? locationNameById.get(row.location_id) : "";
      const candidates = [
        row.profile?.full_name,
        row.profile?.display_name,
        row.profile?.email,
        roleName,
        allRoleNames,
        locationName,
        row.status,
      ];
      return candidates.some(value => value?.toLowerCase().includes(query));
    });
  }, [roster, rosterQuery, roleNameById, locationNameById]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rosterQuery, roster.length]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRoster.length / ROSTER_PAGE_SIZE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [filteredRoster.length, currentPage]);

  const pagedRoster = useMemo(() => {
    const start = Math.max(0, (currentPage - 1) * ROSTER_PAGE_SIZE);
    return filteredRoster.slice(start, start + ROSTER_PAGE_SIZE);
  }, [filteredRoster, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredRoster.length / ROSTER_PAGE_SIZE));

  useEffect(() => {
    let isMounted = true;
    async function loadCurrentUser() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (error) {
        console.error("User management: failed to load current user", error);
        setCurrentUserId(null);
        return;
      }
      setCurrentUserId((user?.id as UUID) ?? null);
    }

    loadCurrentUser();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!businessId) {
      setError("Missing business id.");
      setLoading(false);
      return;
    }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      // business
      const { data: bizRows, error: bizErr } = await supabase
        .from("business")
        .select("id,name,verification_status,owner_user_id")
        .eq("id", businessId)
        .limit(1);
      if (bizErr) throw bizErr;
      const found = bizRows?.[0] ?? null;
      if (!found) {
        setError("Business not found or no access.");
        setBiz(null);
        setRoles([]); setLocations([]); setInvites([]); setPendingEmps([]); setJoinRequests([]);
        setAvailabilityByUser({});
        return;
      }
      setBiz(found);

      // roles
      const { data: roleRows, error: roleErr } = await supabase
        .from("role").select("id,business_id,name,color")
        .eq("business_id", businessId).order("name", { ascending: true });
      if (roleErr) throw roleErr;
      setRoles(roleRows ?? []);

      // locations
      const { data: locRows, error: locErr } = await supabase
        .from("location").select("id,business_id,name,address")
        .eq("business_id", businessId).order("name", { ascending: true });
      if (locErr) throw locErr;
      setLocations(locRows ?? []);

      // invites
      const { data: invRows, error: invErr } = await supabase
        .from("employee_invite")
        .select("id,business_id,email,role_id,location_id,is_manager,is_admin,token,status,invited_by,invited_at,accepted_at")
        .eq("business_id", businessId).eq("status", "pending")
        .order("invited_at", { ascending: false });
      if (invErr) throw invErr;
      setInvites(invRows ?? []);

      const { data: empRows, error: empErr } = await supabase
        .from("employment")
        .select(
          "id,user_id,business_id,location_id,role_id,status,is_manager,is_admin,permissions,pay_rate,hire_date,terminated_at"
        )
        .eq("business_id", businessId)
        .order("id", { ascending: true });
      if (empErr) throw empErr;

      const typedEmpRows = (empRows ?? []) as Employment[];

      const employmentIds = typedEmpRows.map(e => e.id);
      const roleAssignmentsByEmployment = new Map<UUID, UUID[]>();
      if (employmentIds.length) {
        const { data: roleAssignmentRows, error: roleAssignmentErr } = await supabase
          .from("employment_roles")
          .select("employment_id,role_id")
          .in("employment_id", employmentIds);
        if (roleAssignmentErr) {
          // If the table is missing (migration not applied yet), ignore so existing UI keeps working.
          if (roleAssignmentErr.code !== "42P01") throw roleAssignmentErr;
        } else {
          for (const assignment of roleAssignmentRows ?? []) {
            const key = assignment.employment_id as UUID;
            const current = roleAssignmentsByEmployment.get(key) ?? [];
            roleAssignmentsByEmployment.set(key, [...current, assignment.role_id as UUID]);
          }
        }
      }

      const empUserIds = typedEmpRows.map(e => e.user_id);

      // join requests
      const profileColumns = "id,email,first_name,last_name,full_name,display_name,photo_url";
      const { data: reqRows, error: reqErr } = await supabase
        .from("employee_join_request")
        .select(
          `
            id,
            business_id,
            requester_user_id,
            requested_role_id,
            requested_location_id,
            message,
            status,
            created_at,
            requester_profile:profiles!employee_join_request_requester_user_id_fkey (${profileColumns})
          `
        )
        .eq("business_id", businessId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (reqErr) throw reqErr;

      const reqUserIds = (reqRows ?? []).map(r => r.requester_user_id);
      const rosterUserIds = typedEmpRows.map(e => e.user_id);
      const userIds = [
        ...new Set(
          [...empUserIds, ...reqUserIds, ...rosterUserIds].filter((id): id is UUID => Boolean(id))
        ),
      ];

      const profilesById = new Map<string, CoworkerProfile>();
      if (userIds.length) {
        const { data: profRows, error: profErr } = await supabase
          .from("profiles")
          .select(profileColumns)
          .in("id", userIds);
        if (profErr) throw profErr;
        for (const p of (profRows ?? []) as CoworkerProfile[]) {
          profilesById.set(p.id, p);
        }
      }

      const availabilitySummary: Record<string, AvailabilitySummary> = {};
      if (userIds.length) {
        const { data: availRows, error: availErr } = await supabase
          .from("availability")
          .select("user_id,weekly_pattern_json,effective_from,effective_to")
          .in("user_id", userIds)
          .eq("status", "approved")
          .order("effective_from", { ascending: false });

        if (availErr) {
          console.error("Availability query failed", availErr);
        } else if (availRows) {
          const today = normalizeToLocalDay(new Date());
          const active = new Map<string, AvailabilitySummary>();
          const fallback = new Map<string, AvailabilitySummary>();
          for (const row of availRows as AvailabilityRow[]) {
            const start = normalizeToLocalDay(new Date(row.effective_from));
            if (Number.isNaN(start.getTime())) continue;
            const end = row.effective_to ? normalizeToLocalDay(new Date(row.effective_to)) : null;
            const pattern = normalizeAvailabilityPattern(row.weekly_pattern_json);
            const isActive = start.getTime() <= today.getTime() && (!end || end.getTime() >= today.getTime());
            const summary: AvailabilitySummary = {
              pattern,
              effectiveFrom: row.effective_from,
              effectiveTo: row.effective_to,
              isFuture: start.getTime() > today.getTime(),
            };

            if (isActive) {
              if (!active.has(row.user_id)) active.set(row.user_id, summary);
            } else if (!active.has(row.user_id) && !fallback.has(row.user_id)) {
              fallback.set(row.user_id, summary);
            }
          }

          for (const [uid, summary] of active) {
            availabilitySummary[uid] = summary;
          }
          for (const [uid, summary] of fallback) {
            if (!availabilitySummary[uid]) availabilitySummary[uid] = summary;
          }
        }
      }

      const decoratedEmps: EmploymentWithProfile[] = typedEmpRows.map(e => {
        const perms = (e.permissions ?? {}) as { locations_allowed?: UUID[] };
        const allowed = Array.isArray(perms?.locations_allowed)
          ? (perms.locations_allowed as UUID[]).filter(Boolean)
          : [];
        const roleIds = roleAssignmentsByEmployment.get(e.id) ?? (e.role_id ? [e.role_id] : []);
        return {
          ...e,
          pay_rate: e.pay_rate ?? null,
          hire_date: e.hire_date ?? null,
          terminated_at: e.terminated_at ?? null,
          profile: profilesById.get(e.user_id) ?? null,
          allowedLocations: allowed,
          roleIds,
        };
      });

      const pendingRows = decoratedEmps.filter(e => e.status === "invited" || e.status === "inactive");
      setPendingEmps(pendingRows);

      setRoster(decoratedEmps);
      setRosterDrafts(() => {
        const next: Record<string, RosterDraft> = {};
        for (const row of decoratedEmps) {
          next[row.id] = buildRosterDraft(row);
        }
        return next;
      });

      const todayISO = new Date().toISOString();
      for (const row of decoratedEmps) {
        if (!availabilitySummary[row.user_id]) {
          availabilitySummary[row.user_id] = {
            pattern: { ...DEFAULT_AVAILABILITY_PATTERN },
            effectiveFrom: todayISO,
            effectiveTo: null,
            isFuture: false,
          };
        }
      }

      setAvailabilityByUser(availabilitySummary);

      setRosterSummary({
        total: decoratedEmps.length,
        invited: decoratedEmps.filter(r => r.status === "invited").length,
        active: decoratedEmps.filter(r => r.status === "active").length,
        inactive: decoratedEmps.filter(r => r.status === "inactive").length,
        terminated: decoratedEmps.filter(r => r.status === "terminated").length,
      });

      setJoinRequests(
        (reqRows ?? []).map(r => {
          // Supabase relationship is often typed as an array
          const rawRequesterProfile = (r as unknown as {
            requester_profile?: CoworkerProfile | CoworkerProfile[] | null;
          }).requester_profile as CoworkerProfile | CoworkerProfile[] | null | undefined;

          const requesterProfile = Array.isArray(rawRequesterProfile)
            ? rawRequesterProfile[0] ?? null
            : rawRequesterProfile ?? null;

          const profile =
            requesterProfile ?? profilesById.get(r.requester_user_id as UUID) ?? null;

          const result: JoinRequest & { profile: CoworkerProfile | null } = {
            id: r.id as UUID,
            business_id: r.business_id as UUID,
            requester_user_id: r.requester_user_id as UUID,
            requested_role_id: (r.requested_role_id as UUID | null) ?? null,
            requested_location_id: (r.requested_location_id as UUID | null) ?? null,
            message: r.message as string | null,
            status: r.status as JoinRequest["status"],
            created_at: r.created_at as string,
            profile,
          };

          return result;
        })
      );

      if (!userIds.length) {
        setAvailabilityByUser({});
      }
    } catch (e) {
      const msg = (e as PostgrestError)?.message ?? "Failed to load";
      setError(msg);
      setAvailabilityByUser({});
    } finally {
      setLoading(false);
    }
  }


  function openAcceptForInvite(invite: Invite) {
    setOpenTarget({ kind: "invite", invite });
    const initialPrimary = invite.role_id ?? "";
    setFormPrimaryRoleId(initialPrimary);
    setFormRoleIds(initialPrimary ? [initialPrimary] : []);
    setFormIsMgr(invite.is_manager);
    setFormIsAdmin(invite.is_admin);
    setFormPrimaryLocId(invite.location_id ?? "");
    setFormAllowedLocs(invite.location_id ? [invite.location_id] : []);
  }

  function openAcceptForEmployment(emp: EmploymentWithProfile) {
    setOpenTarget({ kind: "employment", employment: emp });
    const initialRoles = emp.roleIds.length ? emp.roleIds : emp.role_id ? [emp.role_id] : [];
    setFormPrimaryRoleId(emp.role_id ?? "");
    setFormRoleIds(initialRoles);
    setFormIsMgr(emp.is_manager);
    setFormIsAdmin(emp.is_admin);
    const perms = (emp.permissions ?? {}) as Record<string, unknown>;
    const allowed = Array.isArray(perms.locations_allowed) ? (perms.locations_allowed as string[]) : [];
    setFormAllowedLocs(allowed);
    setFormPrimaryLocId(emp.location_id ?? "");
  }

  function openAcceptForRequest(req: JoinRequest & { profile: CoworkerProfile | null }) {
    setOpenTarget({ kind: "request", request: req });
    const requested = req.requested_role_id ?? "";
    setFormPrimaryRoleId(requested);
    setFormRoleIds(requested ? [requested] : []);
    setFormIsMgr(false);
    setFormIsAdmin(false);
    setFormPrimaryLocId(req.requested_location_id ?? "");
    setFormAllowedLocs(req.requested_location_id ? [req.requested_location_id] : []);
  }

  function resetPanel() {
    setOpenTarget(null);
    setFormPrimaryRoleId("");
    setFormRoleIds([]);
    setFormIsMgr(false);
    setFormIsAdmin(false);
    setFormAllowedLocs([]);
    setFormPrimaryLocId("");
  }

  async function declineInvite(id: UUID) {
    const { error: err } = await supabase
      .from("employee_invite")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("business_id", businessId);
    if (err) { setError(err.message); return; }
    await loadAll();
  }

  async function denyRequest(id: UUID) {
    const { error } = await supabase.rpc("deny_join_request", { p_request: id });
    if (error) { setError(error.message); return; }
    await loadAll();
  }

  async function acceptSave() {
    if (!verified || !openTarget) return;

    const normalizedRoles = normalizeRoleSelection(formRoleIds, formPrimaryRoleId);
    const primaryRole = formPrimaryRoleId || normalizedRoles[0] || null;
    const permissions = {
      ...(openTarget.kind === "employment" ? openTarget.employment.permissions : {}),
      locations_allowed: formAllowedLocs,
    };

    let employmentIdToSync: UUID | null = null;
    let existingRoleIds: UUID[] | undefined;

    if (openTarget.kind === "invite") {
      const inv = openTarget.invite;

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", inv.email)
        .limit(1)
        .single();
      if (pErr) { setError("User has not signed up yet."); return; }

      const { error: upErr } = await supabase
        .from("employment")
        .upsert(
          {
            user_id: prof.id,
            business_id: inv.business_id,
            role_id: primaryRole,
            location_id: formPrimaryLocId || null,
            status: "active",
            is_manager: formIsMgr,
            is_admin: formIsAdmin,
            permissions,
          },
          { onConflict: "user_id,business_id" }
        );
      if (upErr) { setError(upErr.message); return; }

      const { data: employmentRow, error: employmentErr } = await supabase
        .from("employment")
        .select("id")
        .eq("business_id", inv.business_id)
        .eq("user_id", prof.id)
        .limit(1)
        .maybeSingle();
      if (employmentErr || !employmentRow) {
        setError(employmentErr?.message ?? "Unable to locate employment record after accepting invite.");
        return;
      }
      employmentIdToSync = employmentRow.id as UUID;

      const { error: iErr } = await supabase
        .from("employee_invite")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("business_id", businessId);
      if (iErr) { setError(iErr.message); return; }
    } else if (openTarget.kind === "employment") {
      const emp = openTarget.employment;
      const { error: empErr } = await supabase
        .from("employment")
        .update({
          status: "active",
          role_id: primaryRole,
          location_id: formPrimaryLocId || null,
          is_manager: formIsMgr,
          is_admin: formIsAdmin,
          permissions,
        })
        .eq("id", emp.id)
        .eq("business_id", businessId);
      if (empErr) { setError(empErr.message); return; }
      employmentIdToSync = emp.id;
      existingRoleIds = emp.roleIds;
    } else {
      const req = openTarget.request;
      const { error } = await supabase.rpc("approve_join_request", {
        p_request: req.id,
        p_role: primaryRole,
        p_location: formPrimaryLocId || null,
        p_is_manager: formIsMgr,
        p_is_admin: formIsAdmin,
      });
      if (error) { setError(error.message); return; }

      const { data: employmentRow, error: employmentErr } = await supabase
        .from("employment")
        .select("id")
        .eq("business_id", req.business_id)
        .eq("user_id", req.requester_user_id)
        .limit(1)
        .maybeSingle();
      if (employmentErr || !employmentRow) {
        setError(employmentErr?.message ?? "Unable to locate employment record after approving request.");
        return;
      }
      employmentIdToSync = employmentRow.id as UUID;
    }

    if (employmentIdToSync) {
      await replaceEmploymentRoles(employmentIdToSync, normalizedRoles, existingRoleIds);
    }

    resetPanel();
    await loadAll();
  }

  function updateRosterDraft(row: EmploymentWithProfile, updater: (draft: RosterDraft) => RosterDraft) {
    setRosterDrafts(prev => ({ ...prev, [row.id]: updater(prev[row.id] ?? buildRosterDraft(row)) }));
  }

  function toggleAllowedLocation(row: EmploymentWithProfile, locId: UUID) {
    updateRosterDraft(row, draft => {
      const exists = draft.allowedLocations.includes(locId);
      const nextAllowed = exists ? draft.allowedLocations.filter(id => id !== locId) : [...draft.allowedLocations, locId];
      return { ...draft, allowedLocations: nextAllowed };
    });
  }

  function toggleRosterRole(row: EmploymentWithProfile, roleId: UUID) {
    updateRosterDraft(row, draft => {
      const exists = draft.roleIds.includes(roleId);
      const nextRoles = exists ? draft.roleIds.filter(id => id !== roleId) : [...draft.roleIds, roleId];
      let nextPrimary = draft.primaryRoleId;
      if (!exists && !draft.primaryRoleId) {
        nextPrimary = roleId;
      } else if (exists && draft.primaryRoleId === roleId) {
        nextPrimary = nextRoles[0] ?? "";
      }
      return { ...draft, roleIds: nextRoles, primaryRoleId: nextPrimary };
    });
  }

  async function replaceEmploymentRoles(employmentId: UUID, nextRoleIds: UUID[], existingRoleIds?: UUID[]) {
    let baseline = existingRoleIds;
    if (!baseline) {
      const { data, error } = await supabase
        .from("employment_roles")
        .select("role_id")
        .eq("employment_id", employmentId);
      if (error) throw error;
      baseline = (data ?? []).map(row => row.role_id as UUID);
    }

    const toDelete = (baseline ?? []).filter(id => !nextRoleIds.includes(id));
    if (toDelete.length) {
      const { error } = await supabase
        .from("employment_roles")
        .delete()
        .eq("employment_id", employmentId)
        .in("role_id", toDelete);
      if (error) throw error;
    }

    const toInsert = nextRoleIds.filter(id => !(baseline ?? []).includes(id));
    if (toInsert.length) {
      const payload = toInsert.map(roleId => ({ employment_id: employmentId, role_id: roleId }));
      const { error } = await supabase.from("employment_roles").insert(payload);
      if (error) throw error;
    }
  }

  async function saveRosterRow(row: EmploymentWithProfile) {
    const draft = rosterDrafts[row.id] ?? buildRosterDraft(row);
    if (!rosterRowHasChanges(row, draft)) return;
    const canEdit = verified && row.status !== "terminated";
    if (!canEdit) return;

    const payRateNumber = parsePayRateNumber(draft.payRate);
    if (draft.payRate.trim() && payRateNumber === null) {
      setError("Hourly wage must be a non-negative number.");
      return;
    }
    if (payRateNumber !== null && payRateNumber < 0) {
      setError("Hourly wage must be a non-negative number.");
      return;
    }

    const normalizedRoles = normalizeRoleSelection(draft.roleIds, draft.primaryRoleId);
    const primaryRoleForSave = draft.primaryRoleId || normalizedRoles[0] || null;

    const employmentPatch: Record<string, unknown> = {
      role_id: primaryRoleForSave,
      location_id: draft.primaryLocationId || null,
      is_manager: draft.isManager,
      is_admin: draft.isAdmin,
      pay_rate: payRateNumber,
      hire_date: draft.hireDate || null,
      permissions: {
        ...(row.permissions ?? {}),
        locations_allowed: draft.allowedLocations,
      },
    };

    const profilePatch: Record<string, string | null> = {};
    if (!namesMatch(draft.fullName, row.profile?.full_name)) profilePatch.full_name = draft.fullName.trim() || null;
    if (!namesMatch(draft.displayName, row.profile?.display_name)) profilePatch.display_name = draft.displayName.trim() || null;

    setRosterSaving(prev => ({ ...prev, [row.id]: true }));
    setError(null);
    try {
      const { error: empErr } = await supabase
        .from("employment")
        .update(employmentPatch)
        .eq("id", row.id)
        .eq("business_id", businessId);
      if (empErr) throw empErr;

      await replaceEmploymentRoles(row.id, normalizedRoles, row.roleIds);

      if (Object.keys(profilePatch).length) {
        const { error: profErr } = await supabase
          .from("profiles")
          .update(profilePatch)
          .eq("id", row.user_id);
        if (profErr) throw profErr;
      }

      await loadAll();
    } catch (saveErr) {
      const msg = (saveErr as PostgrestError)?.message ?? (saveErr as Error)?.message ?? "Failed to save changes";
      setError(msg);
    } finally {
      setRosterSaving(prev => ({ ...prev, [row.id]: false }));
    }
  }

  function openTerminate(row: EmploymentWithProfile) {
    if (row.user_id === currentUserId) return;
    setTerminateTarget(row);
    setTerminateReason("");
  }

  function closeTerminateModal() {
    setTerminateTarget(null);
    setTerminateReason("");
    setTerminateBusy(false);
  }

  async function confirmTermination() {
    if (!terminateTarget) return;
    setTerminateBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/employment/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employmentId: terminateTarget.id,
          userId: terminateTarget.user_id,
          businessId,
          reason: terminateReason || null,
        }),
      });

      if (!resp.ok) {
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Failed to terminate user");
      }

      await loadAll();
      closeTerminateModal();
    } catch (termErr) {
      const msg = termErr instanceof Error ? termErr.message : "Failed to terminate user";
      setError(msg);
      setTerminateBusy(false);
    }
  }

  async function sendOwnerInvites(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError("");
    setInviteResults([]);
    if (!isOwner) {
      setInviteError("Only the business owner can send invites from this page.");
      return;
    }
    if (!biz) {
      setInviteError("Business details not available yet.");
      return;
    }
    if (!verified) {
      setInviteError("The business must be verified before sending invites.");
      return;
    }
    if (inviteEmails.length === 0) {
      setInviteError("Enter at least one valid email.");
      return;
    }

    setInviteSending(true);
    try {
      const resp = await fetch("/api/invitation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: biz.id,
          invites: inviteEmails.map(email => ({
            email,
            roleId: inviteRoleId || undefined,
            locationId: inviteLocationId || undefined,
            isManager: inviteIsManager,
            isAdmin: inviteIsAdmin,
          })),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as { invites?: InviteResult[]; error?: string };
      if (!resp.ok) {
        setInviteError(data.error ?? "Failed to send invites.");
        return;
      }
      setInviteResults(data.invites ?? []);
      setRawInviteEmails("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Network error");
    } finally {
      setInviteSending(false);
    }
  }


  /* ---------- UI ---------- */
  return (
    <main className="relative min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt--2 sm:pt-12 lg:pt-24 pb-12">
        {isOwner && (
          <section className="mb-8 rounded-2xl border border-border bg-card shadow-sm p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/60">Owner tools</p>
                <h2 className="text-xl font-semibold text-foreground">Send employee invites</h2>
                <p className="text-sm text-foreground/70">
                  Send batch invite emails through Resend. Invited teammates will get a unique link to join your business.
                </p>
              </div>
              <div className="text-sm text-foreground/60">
                {inviteEmails.length === 0
                  ? "No emails queued"
                  : `${inviteEmails.length} email${inviteEmails.length === 1 ? "" : "s"} ready`}
              </div>
            </div>

            {!verified && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                Your business must be verified before invites can be delivered.
              </div>
            )}

            <form onSubmit={sendOwnerInvites} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email addresses</label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="one@company.com, two@company.com"
                  rows={3}
                  value={rawInviteEmails}
                  onChange={e => setRawInviteEmails(e.target.value)}
                  disabled={inviteSending}
                />
                {inviteEmails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inviteEmails.map(email => (
                      <span key={email} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                        {email}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Role (optional)</label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={inviteRoleId}
                    onChange={e => setInviteRoleId(e.target.value as UUID | "")}
                    disabled={inviteSending}
                  >
                    <option value="">— None —</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Location (optional)</label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={inviteLocationId}
                    onChange={e => setInviteLocationId(e.target.value as UUID | "")}
                    disabled={inviteSending}
                  >
                    <option value="">— None —</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm text-foreground">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={inviteIsManager}
                    onChange={e => setInviteIsManager(e.target.checked)}
                    disabled={inviteSending}
                  />
                  Manager
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={inviteIsAdmin}
                    onChange={e => setInviteIsAdmin(e.target.checked)}
                    disabled={inviteSending}
                  />
                  Admin
                </label>
              </div>

              {inviteError && (
                <div className="text-sm text-rose-600">{inviteError}</div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  disabled={inviteSending || !verified}
                >
                  {inviteSending ? "Sending…" : "Send invites"}
                </button>
                {inviteEmails.length > 0 && (
                  <div className="text-xs text-foreground/60">{inviteEmails.length} recipient{inviteEmails.length === 1 ? "" : "s"}</div>
                )}
              </div>
            </form>

            {inviteResults.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-foreground mb-2">Delivery status</p>
                <div className="rounded-lg border border-border divide-y">
                  {inviteResults.map(({ email, emailed, error, joinUrl }) => (
                    <div key={email} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <div className="flex-1">
                        <div className="font-mono text-foreground">{email}</div>
                        <div className={cx("text-xs", emailed ? "text-green-700" : "text-rose-700")}
                        >
                          {emailed ? "Email sent" : `Email not sent: ${error ?? "unknown error"}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-background/70"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(joinUrl);
                          } catch {
                            // ignore clipboard errors
                          }
                        }}
                      >
                        Copy link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <header className="mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">User management</h1>
          </div>
          {biz && (
            <div className="mt-1 text-sm text-foreground/70">
              <span className="font-medium">{biz.name}</span>
              <span className="mx-2">·</span>
              <span>
                Verification:
                <span className={cx("ml-1", biz.verification_status === "verified" ? "text-green-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300")}>
                  {biz.verification_status}
                </span>
              </span>
            </div>
          )}
        </header>

        {error && <div className="mb-4 rounded-md bg-rose-50 text-rose-700 px-3 py-2 text-sm dark:bg-rose-900 dark:text-rose-200">{error}</div>}

        {loading ? (
          <div className="text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 auto-rows-fr">
            {/* Pending invites */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1 flex flex-col">
              <div className="px-4 py-3 border-b font-medium">Pending invites</div>
              <ul className="divide-y flex-1">
                {invites.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending invites.</li>}
                {invites.map(inv => (
                  <li key={inv.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{inv.email}</div>
                        <div className="text-xs text-foreground/60">
                          Role: {roles.find(r => r.id === inv.role_id)?.name ?? "—"} ·{" "}
                          Location: {locations.find(l => l.id === inv.location_id)?.name ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={() => openAcceptForInvite(inv)}
                          disabled={disabledUI}
                          title={disabledUI ? "Business must be verified" : "Accept"}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-4 h-4" /> Accept
                          </span>
                        </button>
                        <button
                          className="px-3 py-1 rounded-md bg-rose-600 text-white text-sm dark:bg-rose-600 dark:hover:bg-rose-700"
                          onClick={() => declineInvite(inv.id)}
                          title="Decline"
                        >
                          <span className="inline-flex items-center gap-1">
                            <X className="w-4 h-4" /> Decline
                          </span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pending activations */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1 flex flex-col">
              <div className="px-4 py-3 border-b font-medium">Pending activations</div>
              <ul className="divide-y flex-1">
                {pendingEmps.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending activations.</li>}
                {pendingEmps.map(emp => {
                  const allRoleIds = emp.roleIds.length ? emp.roleIds : emp.role_id ? [emp.role_id] : [];
                  const pendingRoleNames = allRoleIds
                    .map(roleId => roleNameById.get(roleId) ?? "")
                    .filter(Boolean)
                    .join(", ") || "—";
                  return (
                    <li key={emp.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {emp.profile?.full_name || emp.profile?.email || emp.user_id}
                          </div>
                          <div className="text-xs text-foreground/60">
                            Status: {emp.status} · Roles: {pendingRoleNames} · Primary: {locations.find(l => l.id === emp.location_id)?.name ?? "—"}
                          </div>
                        </div>
                        <button
                          className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={() => openAcceptForEmployment(emp)}
                          disabled={disabledUI}
                          title={disabledUI ? "Business must be verified" : "Activate"}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-4 h-4" /> Activate
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Join requests */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1 flex flex-col">
              <div className="px-4 py-3 border-b font-medium">Join requests</div>
              <ul className="divide-y flex-1">
                {joinRequests.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending requests.</li>}
                {joinRequests.map(req => {
                  const concatenatedName = [req.profile?.first_name, req.profile?.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const fullName = concatenatedName || req.profile?.full_name || req.profile?.display_name || "Name unavailable";
                  const email = req.profile?.email || "No email on file";
                  const userId = req.requester_user_id;
                  const requestedLocation = locations.find(l => l.id === req.requested_location_id)?.name ?? "Any location";
                  return (
                    <li key={req.id} className="p-4">
                      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{fullName}</p>
                            <p className="text-sm text-foreground/70">{email}</p>
                            <p className="text-xs text-foreground/50">
                              User ID: <span className="font-mono text-foreground/80">{userId}</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                              onClick={() => openAcceptForRequest(req)}
                              disabled={disabledUI}
                              title={disabledUI ? "Business must be verified" : "Approve"}
                            >
                              <span className="inline-flex items-center gap-1">
                                <Check className="w-4 h-4" /> Approve
                              </span>
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm dark:bg-rose-600 dark:hover:bg-rose-700"
                              onClick={() => denyRequest(req.id)}
                              title="Deny"
                            >
                              <span className="inline-flex items-center gap-1">
                                <X className="w-4 h-4" /> Deny
                              </span>
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-3 text-xs text-foreground/70 sm:grid-cols-1">
                          <div className="rounded-lg border border-border bg-background/40 p-3">
                            <p className="text-foreground/60 uppercase text-[11px] tracking-wide">Requested location</p>
                            <p className="text-sm text-foreground mt-1">{requestedLocation}</p>
                          </div>
                        </div>
                        {req.message && (
                          <div className="rounded-lg border border-dashed border-border/70 bg-background/30 p-3 text-xs text-foreground/80">
                            <p className="font-medium text-foreground text-sm mb-1">Message</p>
                            <p>{req.message}</p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}

        {/* Employee roster */}
        <section className="mt-8 bg-background border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-medium">Employees</div>
              <p className="text-sm text-foreground/60">Full roster with wage, hire date, role, and location controls.</p>
            </div>
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
              <div className="flex flex-wrap gap-3 text-xs text-foreground/70">
                <span>Total: {rosterSummary.total}</span>
                <span>Invited: {rosterSummary.invited}</span>
                <span>Active: {rosterSummary.active}</span>
                <span>Inactive: {rosterSummary.inactive}</span>
                <span>Terminated: {rosterSummary.terminated}</span>
              </div>
              <input
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm lg:w-80"
                type="search"
                placeholder="Search by name, email, role, or location"
                value={rosterQuery}
                onChange={e => setRosterQuery(e.target.value)}
              />
            </div>
          </div>
          {filteredRoster.length === 0 ? (
            <div className="px-4 py-6 text-sm text-foreground/60">
              {rosterQuery ? "No employees match your search." : "No employees found for this business."}
            </div>
          ) : (
            <>
              <div className="space-y-6">
                {pagedRoster.map(row => {
                  const draft = rosterDrafts[row.id] ?? buildRosterDraft(row);
                  const saving = !!rosterSaving[row.id];
                  const canEdit = verified && row.status !== "terminated";
                  const hasChanges = canEdit && rosterRowHasChanges(row, draft);
                  const statusBadge = STATUS_BADGE[row.status] || "bg-muted text-foreground";
                  const avatarUrl = row.profile?.photo_url || null;
                  const avatarAlt = row.profile?.display_name || row.profile?.full_name || row.profile?.email || "Employee avatar";
                  const availability = availabilityByUser[row.user_id];
                  const availabilityFrom = availability ? formatDisplayDate(availability.effectiveFrom) : null;
                  const availabilityTo = availability?.effectiveTo ? formatDisplayDate(availability.effectiveTo) : null;

                  return (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-border bg-card/50 p-6 shadow-sm space-y-6"
                    >
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="flex gap-4 w-full">
                          <div className="relative h-16 w-16 rounded-full border border-border bg-foreground/10 text-foreground flex items-center justify-center font-semibold overflow-hidden shrink-0">
                            {avatarUrl ? (
                              <Image
                                src={avatarUrl}
                                alt={`${avatarAlt} profile photo`}
                                fill
                                sizes="64px"
                                className="object-cover"
                              />
                            ) : (
                              profileInitials(row.profile)
                            )}
                          </div>
                          <div className="flex-1 space-y-3">
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs uppercase tracking-wide text-foreground/60">Full name</label>
                                <input
                                  className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                                  value={draft.fullName}
                                  onChange={e => updateRosterDraft(row, d => ({ ...d, fullName: e.target.value }))}
                                  disabled={!canEdit}
                                />
                              </div>
                              <div>
                                <label className="text-xs uppercase tracking-wide text-foreground/60">Display name</label>
                                <input
                                  className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                                  value={draft.displayName}
                                  onChange={e => updateRosterDraft(row, d => ({ ...d, displayName: e.target.value }))}
                                  disabled={!canEdit}
                                />
                              </div>
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-foreground/70">{row.profile?.email ?? "No email on file"}</p>
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadge}`}>
                                {row.status}
                              </span>
                              {row.roleIds.length > 0 && (
                                <p className="text-xs text-foreground/70">
                                  Roles: {row.roleIds
                                    .map(rid => roleNameById.get(rid) ?? "")
                                    .filter(Boolean)
                                    .join(", ") || "—"}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm text-foreground">Primary role</label>
                            <select
                              className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                              value={draft.primaryRoleId}
                              onChange={e =>
                                updateRosterDraft(row, d => {
                                  const nextPrimary = e.target.value as UUID | "";
                                  const alreadyIncluded = nextPrimary ? d.roleIds.includes(nextPrimary) : false;
                                  return {
                                    ...d,
                                    primaryRoleId: nextPrimary,
                                    roleIds: nextPrimary && !alreadyIncluded ? [...d.roleIds, nextPrimary] : d.roleIds,
                                  };
                                })
                              }
                              disabled={!canEdit}
                            >
                              <option value="">No role</option>
                              {roles.map(role => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm text-foreground">All roles</label>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                              {roles.map(role => {
                                const checked = draft.roleIds.includes(role.id);
                                return (
                                  <label key={role.id} className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="accent-primary"
                                      checked={checked}
                                      onChange={() => toggleRosterRole(row, role.id)}
                                      disabled={!canEdit}
                                    />
                                    <span>{role.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="mt-1 text-xs text-foreground/60">
                              Select every role this teammate can cover; the primary role drives scheduling defaults.
                            </p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm text-foreground">Primary location</label>
                            <select
                              className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                              value={draft.primaryLocationId}
                              onChange={e => updateRosterDraft(row, d => ({ ...d, primaryLocationId: e.target.value as UUID | "" }))}
                              disabled={!canEdit}
                            >
                              <option value="">None</option>
                              {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm text-foreground">Allowed locations</label>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                              {locations.map(loc => {
                                const checked = draft.allowedLocations.includes(loc.id);
                                return (
                                  <label key={loc.id} className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="accent-primary"
                                      checked={checked}
                                      onChange={() => toggleAllowedLocation(row, loc.id)}
                                      disabled={!canEdit}
                                    />
                                    <span>{loc.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-6 lg:grid-cols-2">
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm text-foreground">Hourly wage</label>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-sm text-foreground/60">$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                pattern="\\d*(\\.\\d{0,2})?"
                                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                                value={draft.payRate}
                                placeholder="0.00"
                                onChange={e =>
                                  updateRosterDraft(row, d => ({ ...d, payRate: sanitizePayRateInput(e.target.value) }))
                                }
                                onBlur={() =>
                                  updateRosterDraft(row, d => ({ ...d, payRate: formatPayRateString(d.payRate) }))
                                }
                                disabled={!canEdit}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-sm text-foreground">Hire date</label>
                            <input
                              type="date"
                              className="mt-2 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                              value={draft.hireDate}
                              onChange={e => updateRosterDraft(row, d => ({ ...d, hireDate: e.target.value }))}
                              disabled={!canEdit}
                            />
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-sm text-foreground">Leadership permissions</label>
                            <div className="flex flex-wrap gap-4 text-sm">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="accent-primary"
                                  checked={draft.isManager}
                                  onChange={e => updateRosterDraft(row, d => ({ ...d, isManager: e.target.checked }))}
                                  disabled={!canEdit}
                                />
                                Manager
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="accent-primary"
                                  checked={draft.isAdmin}
                                  onChange={e => updateRosterDraft(row, d => ({ ...d, isAdmin: e.target.checked }))}
                                  disabled={!canEdit}
                                />
                                Admin
                              </label>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border bg-background/40 p-4">
                            <div className="flex items-center justify-between text-sm font-medium text-foreground">
                              <span>Current availability</span>
                              <span className="text-xs text-foreground/60">
                                {availability.isFuture ? "Pending" : "Active"}
                              </span>
                            </div>
                            {availability ? (
                              <div className="mt-3 space-y-2">
                                <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-3">
                                  {AVAILABILITY_DAY_ORDER.map(({ key, label }) => {
                                    const status = availability.pattern[key];
                                    return (
                                      <span
                                        key={key}
                                        className={`inline-flex items-center justify-between rounded-md px-2 py-1 ${AVAILABILITY_BADGE[status]}`}
                                      >
                                        <span className="font-semibold">{label}</span>
                                        <span>{AVAILABILITY_STATUS_LABEL[status]}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                                <p className="text-[11px] text-foreground/60">
                                  Effective {availabilityFrom ?? "Unknown"}
                                  {availabilityTo ? ` - ${availabilityTo}` : ""}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-foreground/60">No approved availability on file.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
                        <div className="text-xs text-foreground/70">
                          Last updated fields reflect saved employment data. Remember to save after making adjustments.
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                            onClick={() => saveRosterRow(row)}
                            disabled={!hasChanges || saving}
                          >
                            {saving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Saving
                              </>
                            ) : (
                              <>Save</>
                            )}
                          </button>
                          <button
                            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm"
                            onClick={() => updateRosterDraft(row, () => buildRosterDraft(row))}
                            disabled={!hasChanges || saving}
                          >
                            Reset
                          </button>
                          {row.status !== "terminated" && row.user_id !== currentUserId && (
                            <button
                              className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                              onClick={() => openTerminate(row)}
                              disabled={disabledUI || saving}
                            >
                              <UserX className="h-4 w-4" /> Terminate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                  <button
                    className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Accept modal */}
        {openTarget && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 px-4">
            <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-xl">
              <div className="flex items-start justify-between border-b border-border px-5 py-4">
                <div className="font-semibold text-lg">
                  {openTarget.kind === "invite" && `Accept invite: ${openTarget.invite.email}`}
                  {openTarget.kind === "employment" &&
                    `Activate: ${openTarget.employment.profile?.full_name || openTarget.employment.profile?.email || openTarget.employment.user_id}`}
                  {openTarget.kind === "request" &&
                    `Approve request: ${openTarget.request.profile?.full_name || openTarget.request.profile?.email || openTarget.request.requester_user_id}`}
                </div>
                <button
                  type="button"
                  className="rounded-md border border-border/70 p-1 text-foreground hover:bg-background/70"
                  onClick={resetPanel}
                  aria-label="Close approval dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm mb-1 text-foreground">Primary role</label>
                    <select
                      value={formPrimaryRoleId}
                      onChange={e => handlePrimaryRoleChange(e.target.value as UUID | "")}
                      className="w-full border border-border rounded-md px-3 py-2 bg-transparent text-foreground"
                    >
                      <option value="">No role</option>
                      {roles.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm mb-1 text-foreground">All roles</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      {roles.map(role => {
                        const checked = formRoleIds.includes(role.id);
                        return (
                          <label key={role.id} className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="accent-primary"
                              checked={checked}
                              onChange={() => toggleFormRole(role.id)}
                            />
                            <span>{role.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-foreground/60 mt-1">
                      Choose every role this person should be eligible for. The primary role drives scheduling defaults.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-foreground">Primary location</label>
                    <select
                      value={formPrimaryLocId}
                      onChange={e => setFormPrimaryLocId(e.target.value as UUID | "")}
                      className="w-full border border-border rounded-md px-3 py-2 bg-transparent text-foreground"
                    >
                      <option value="">None</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm mb-1 text-foreground">Allowed locations</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {locations.map(l => {
                        const checked = formAllowedLocs.includes(l.id);
                        return (
                          <label key={l.id} className="inline-flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              className="accent-primary"
                              checked={checked}
                              onChange={() =>
                                setFormAllowedLocs(prev => (checked ? prev.filter(x => x !== l.id) : [...prev, l.id]))
                              }
                            />
                            <span>{l.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-foreground/60 mt-1">
                      Stored in <code>employment.permissions.locations_allowed</code>.
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" className="accent-primary" checked={formIsMgr} onChange={e => setFormIsMgr(e.target.checked)} />
                      Manager
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" className="accent-primary" checked={formIsAdmin} onChange={e => setFormIsAdmin(e.target.checked)} />
                      Admin
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-end">
                  <button
                    className="rounded-md border border-border px-4 py-2 text-sm"
                    onClick={resetPanel}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    onClick={acceptSave}
                    disabled={!verified}
                    title={verified ? "Save" : "Business must be verified"}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {terminateTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Terminate employee</h2>
            <p className="text-sm text-foreground/70">
              This immediately revokes access for {terminateTarget.profile?.display_name || terminateTarget.profile?.full_name || terminateTarget.profile?.email || terminateTarget.user_id}.
              The record remains visible for seven days before automatic removal.
            </p>
            <label className="mt-4 block text-sm text-foreground">Optional note</label>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
              rows={3}
              value={terminateReason}
              onChange={e => setTerminateReason(e.target.value)}
            />
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-md border border-border px-4 py-2 text-sm" onClick={closeTerminateModal} disabled={terminateBusy}>
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={confirmTermination}
                disabled={terminateBusy}
              >
                {terminateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                Confirm termination
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

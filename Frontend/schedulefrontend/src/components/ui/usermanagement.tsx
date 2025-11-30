"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestError } from "@supabase/supabase-js";
import { Check, X, ChevronDown, Loader2, UserX } from "lucide-react";

type UUID = string;

type Business = {
  id: UUID;
  name: string;
  verification_status: "unverified" | "docs_submitted" | "verified" | "rejected";
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

type CoworkerProfile = { id: UUID; email: string | null; full_name: string | null; display_name: string | null };

type EmploymentWithProfile = Employment & {
  profile: CoworkerProfile | null;
  allowedLocations: UUID[];
  roleIds: UUID[];
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


function addDays(iso: string, days: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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

export default function UserManagement({ businessId }: Props) {
  const supabase = createClientComponentClient();
  const router = useRouter();

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

  const verified = biz?.verification_status === "verified";
  const disabledUI = !verified;

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
        .select("id,name,verification_status")
        .eq("id", businessId)
        .limit(1);
      if (bizErr) throw bizErr;
      const found = bizRows?.[0] ?? null;
      if (!found) {
        setError("Business not found or no access.");
        setBiz(null);
        setRoles([]); setLocations([]); setInvites([]); setPendingEmps([]); setJoinRequests([]);
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
      const { data: reqRows, error: reqErr } = await supabase
        .from("employee_join_request")
        .select("id,business_id,requester_user_id,requested_role_id,requested_location_id,message,status,created_at")
        .eq("business_id", businessId).eq("status","pending")
        .order("created_at",{ ascending:false });
      if (reqErr) throw reqErr;

      const reqUserIds = (reqRows ?? []).map(r => r.requester_user_id);
      const rosterUserIds = typedEmpRows.map(e => e.user_id);
      const userIds = [...new Set([...empUserIds, ...reqUserIds, ...rosterUserIds])];

      const profilesById = new Map<string, CoworkerProfile>();
      if (userIds.length) {
        const { data: profRows, error: profErr } = await supabase
          .from("profiles").select("id,email,full_name,display_name").in("id", userIds);
        if (profErr) throw profErr;
        for (const p of profRows ?? []) profilesById.set(p.id, p);
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

      setRosterSummary({
        total: decoratedEmps.length,
        invited: decoratedEmps.filter(r => r.status === "invited").length,
        active: decoratedEmps.filter(r => r.status === "active").length,
        inactive: decoratedEmps.filter(r => r.status === "inactive").length,
        terminated: decoratedEmps.filter(r => r.status === "terminated").length,
      });

      setJoinRequests(
        (reqRows ?? []).map(r => ({ ...r, profile: profilesById.get(r.requester_user_id) ?? null }))
      );
    } catch (e) {
      const msg = (e as PostgrestError)?.message ?? "Failed to load";
      setError(msg);
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


  /* ---------- UI ---------- */
  return (
    <main className="relative min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <header className="mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.replace("/employermanagement/employerhomepage")}
              className="px-3 py-2 rounded-lg border border-border text-foreground hover:bg-background/95"
            >
              Back to Home
            </button>
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Pending invites */}
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1">
                <div className="px-4 py-3 border-b font-medium">Pending invites</div>
                <ul className="divide-y">
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
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1">
              <div className="px-4 py-3 border-b font-medium">Pending activations</div>
              <ul className="divide-y">
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
            <section className="bg-background border border-border rounded-xl shadow-sm overflow-hidden xl:col-span-1">
              <div className="px-4 py-3 border-b font-medium">Join requests</div>
              <ul className="divide-y">
                {joinRequests.length === 0 && <li className="px-4 py-6 text-sm text-foreground/60">No pending requests.</li>}
                {joinRequests.map(req => (
                  <li key={req.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {req.profile?.full_name || req.profile?.email || req.requester_user_id}
                        </div>
                        <div className="text-xs text-foreground/60">
                          Requested role: {roles.find(r => r.id === req.requested_role_id)?.name ?? "—"} ·{" "}
                          Requested location: {locations.find(l => l.id === req.requested_location_id)?.name ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          onClick={() => openAcceptForRequest(req)}
                          disabled={disabledUI}
                          title={disabledUI ? "Business must be verified" : "Approve"}
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-4 h-4" /> Approve
                          </span>
                        </button>
                        <button
                          className="px-3 py-1 rounded-md bg-rose-600 text-white text-sm dark:bg-rose-600 dark:hover:bg-rose-700"
                          onClick={() => denyRequest(req.id)}
                          title="Deny"
                        >
                          <span className="inline-flex items-center gap-1">
                            <X className="w-4 h-4" /> Deny
                          </span>
                        </button>
                      </div>
                    </div>
                    {req.message && <p className="mt-1 text-xs text-foreground/70">{req.message}</p>}
                  </li>
                ))}
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
              <div className="divide-y">
                {pagedRoster.map(row => {
                const draft = rosterDrafts[row.id] ?? buildRosterDraft(row);
                const saving = !!rosterSaving[row.id];
                const canEdit = verified && row.status !== "terminated";
                const hasChanges = canEdit && rosterRowHasChanges(row, draft);
                const statusBadge = STATUS_BADGE[row.status] || "bg-muted text-foreground";
                const removalDate = row.terminated_at ? formatDateShort(addDays(row.terminated_at, 7)) : null;

                return (
                  <div key={row.id} className="p-4 space-y-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                      <div className="flex gap-3 w-full lg:w-72">
                        <div className="h-12 w-12 rounded-full bg-foreground/10 text-foreground flex items-center justify-center font-semibold">
                          {profileInitials(row.profile)}
                        </div>
                        <div className="space-y-2 flex-1">
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
                          <p className="text-xs text-foreground/60">Email: {row.profile?.email ?? "—"}</p>
                          <div className="text-xs font-medium">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 capitalize ${statusBadge}`}>
                              {row.status}
                            </span>
                          </div>
                          {row.roleIds.length > 0 && (
                            <div className="text-xs text-foreground/70">
                              Roles: {row.roleIds
                                .map(rid => roleNameById.get(rid) ?? "")
                                .filter(Boolean)
                                .join(", ") || "—"}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                        <div>
                          <label className="text-sm text-foreground">Primary role</label>
                          <select
                            className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
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
                        <div className="md:col-span-2">
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
                            Select every role this employee can cover; the primary role is used for scheduling defaults.
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-foreground">Primary location</label>
                          <select
                            className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
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
                        <div className="md:col-span-2">
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
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm text-foreground">Hourly wage</label>
                            <div className="mt-1 flex items-center gap-2">
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
                              className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                              value={draft.hireDate}
                              onChange={e => updateRosterDraft(row, d => ({ ...d, hireDate: e.target.value }))}
                              disabled={!canEdit}
                            />
                          </div>
                          <div className="flex gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                className="accent-primary"
                                checked={draft.isManager}
                                onChange={e => updateRosterDraft(row, d => ({ ...d, isManager: e.target.checked }))}
                                disabled={!canEdit}
                              />
                              Manager
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
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
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border pt-3 md:flex-row md:items-center md:justify-between">
                      <div className="text-xs text-foreground/70 space-y-1">
                        <div>Employment ID: {row.id}</div>
                        {row.hire_date && <div>Hired: {formatDateShort(row.hire_date)}</div>}
                        {row.terminated_at && (
                          <div className="text-rose-600 dark:text-rose-300">
                            Terminated: {formatDateShort(row.terminated_at)}
                            {removalDate && ` · Scheduled removal ${removalDate}`}
                          </div>
                        )}
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
                        {row.status !== "terminated" && (
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

        {/* Inline accept panel */}
        {openTarget && (
          <div className="mt-6 bg-background border border-border rounded-xl shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 border-b"
              onClick={() => setOpenTarget(openTarget ? null : openTarget)}
            >
              <div className="font-medium">
                {openTarget.kind === "invite" && `Accept invite: ${openTarget.invite.email}`} 
                {openTarget.kind === "employment" &&
                  `Activate: ${openTarget.employment.profile?.full_name || openTarget.employment.profile?.email || openTarget.employment.user_id}`}
                {openTarget.kind === "request" &&
                  `Approve request: ${openTarget.request.profile?.full_name || openTarget.request.profile?.email || openTarget.request.requester_user_id}`}
              </div>
              <ChevronDown className="w-4 h-4" />
            </button>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1 text-foreground">Primary role</label>
                <select
                  value={formPrimaryRoleId}
                  onChange={e => handlePrimaryRoleChange(e.target.value as UUID | "")}
                  className="w-full border border-border rounded-md px-3 py-2 bg-transparent text-foreground"
                >
                  <option value="">No role</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
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
                            setFormAllowedLocs(prev => checked ? prev.filter(x => x !== l.id) : [...prev, l.id])
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

              <div className="md:col-span-2 flex gap-2">
                <button
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  onClick={acceptSave}
                  disabled={!verified}
                  title={verified ? "Save" : "Business must be verified"}
                >
                  Save
                </button>
                <button className="px-4 py-2 rounded-md border border-border text-sm text-foreground" onClick={resetPanel}>
                  Cancel
                </button>
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

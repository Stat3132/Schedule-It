"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Home, Plus, Clock, CheckSquare, Bell, Users, Settings, LogOut, AlertTriangle } from "lucide-react";

type BusinessOpt = { id: string; name: string | null };
type LocationOpt = { id: string; name: string };
type EmploymentRow = { business_id: string; is_manager?: boolean | null; is_admin?: boolean | null };
type BusinessRow = { id: string; name: string | null };

export default function EmployerTopNav() {
  const supabase = useRef(createClientComponentClient()).current;
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const [businesses, setBusinesses] = useState<BusinessOpt[]>([]);
  const [selectedBiz, setSelectedBiz] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | "ALL">("ALL");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBiz = localStorage.getItem("activeBusinessId");
    const storedLocsRaw = localStorage.getItem("activeLocationIds");
    const storedLocs = storedLocsRaw ? JSON.parse(storedLocsRaw) : [];
    if (storedBiz) setSelectedBiz(storedBiz);
    if (storedLocs?.[0]) setSelectedLoc(storedLocs[0]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (!uid) return;

      const { data: empData } = await supabase
        .from("employment")
        .select("business_id,is_manager,is_admin,status")
        .eq("status", "active")
        .or("is_manager.eq.true,is_admin.eq.true");
      const empRows = (empData ?? []) as EmploymentRow[];
      const mgrIds = Array.from(
        new Set(empRows.filter((e) => e.is_manager || e.is_admin).map((e) => e.business_id)),
      );

      const { data: ownedRows } = await supabase
        .from("business")
        .select("id,name")
        .eq("owner_user_id", uid);
      const ownedRaw = (ownedRows ?? []) as BusinessRow[];
      const owned = ownedRaw.map((r) => ({ id: r.id, name: r.name }));
      const idSet = new Set<string>(mgrIds);
      for (const b of owned) idSet.add(b.id);
      const idList = Array.from(idSet);

      let named: BusinessOpt[] = owned;
      const needNames = idList.filter((id) => !owned.find((o) => o.id === id));

      if (needNames.length) {
        const { data: bRows } = await supabase
          .from("business")
          .select("id,name")
          .in("id", needNames);
        const extraRaw = (bRows ?? []) as BusinessRow[];
        const extra = extraRaw.map((r) => ({ id: r.id, name: r.name ?? null }));
        const existingIds = new Set(named.map((x) => x.id));
        named = named.concat(extra.filter((e) => !existingIds.has(e.id)));
        for (const id of needNames) if (!named.find((n) => n.id === id)) named.push({ id, name: null });
      }

      if (!cancelled) {
        setBusinesses(named);
        if (!selectedBiz && idList.length > 0) setSelectedBiz(idList[0]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedBiz) localStorage.setItem("activeBusinessId", selectedBiz);
  }, [selectedBiz]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedLoc && selectedLoc !== "ALL") localStorage.setItem("activeLocationIds", JSON.stringify([selectedLoc]));
    else localStorage.removeItem("activeLocationIds");
  }, [selectedLoc]);

  useEffect(() => {
    let cancelled = false;
      (async () => {
      if (!selectedBiz) {
        setLocations([]); setSelectedLoc("ALL");
        return;
      }
      const { data, error } = await supabase.from("location").select("id,name").eq("business_id", selectedBiz);
      if (cancelled) return;
      if (error) {
        setLocations([]);
        setSelectedLoc("ALL");
        return;
      }
      const locs = (data ?? []) as LocationOpt[];
      setLocations(locs);
      if (selectedLoc !== "ALL" && !locs.find((l) => l.id === selectedLoc)) setSelectedLoc("ALL");
    })();
    return () => { cancelled = true; };
  }, [selectedBiz]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.replace("/employermanagement/employerhomepage")}
              aria-label="Home"
              title="Home"
              className="inline-flex items-center gap-2 px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Home className="w-4 h-4" />
            </button>
            <select
              className="border rounded-md px-2 py-1 text-sm"
              value={selectedBiz ?? ""}
              onChange={(e) => setSelectedBiz(e.target.value || null)}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name ?? b.id}</option>
              ))}
            </select>

            <select
              className="border rounded-md px-2 py-1 text-sm"
              value={selectedLoc}
              onChange={(e) => setSelectedLoc((e.target.value as string) || "ALL")}
              disabled={!selectedBiz}
            >
              <option value="ALL">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1">
            {/* compute active state and apply blue highlight */}
            {(() => {
              const base = "px-4 py-2 text-sm rounded-lg flex items-center gap-2";
              const inactive = "text-gray-700 hover:bg-gray-100";
              const active = "bg-blue-50 border border-blue-200 text-blue-700";

              const btn = (label: string, icon: React.ReactNode, href: string, matchPrefix = href) => {
                const isActive = pathname.startsWith(matchPrefix);
                const cls = `${base} ${isActive ? active : inactive}`;
                return (
                  <button key={label} className={cls} onClick={() => router.push(href)}>
                    {icon}
                    {label}
                  </button>
                );
              };

              return (
                <>
                  {btn("Create Schedule", <Plus className="w-4 h-4" />, "/employermanagement/createschedule")}
                  {btn("Time Off Requests", <Clock className="w-4 h-4" />, "/employermanagement/managetimerequests")}
                  {btn("Availability Requests", <CheckSquare className="w-4 h-4" />, "/employermanagement/availabilityrequest")}
                  {btn("Dropped Shifts", <AlertTriangle className="w-4 h-4" />, "/employermanagement/managedroppedshifts")}
                  {btn("Announcements", <Bell className="w-4 h-4" />, "/employermanagement/announcements")}
                  {btn("User Management", <Users className="w-4 h-4" />, "/employermanagement/employeeinvitemanagement", "/employermanagement/employeeinvitemanagement")}
                  {btn("Settings", <Settings className="w-4 h-4" />, "/employermanagement/settings")}
                  <button className={`${base} ${inactive}`} onClick={handleLogout}>
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </nav>
  );
}

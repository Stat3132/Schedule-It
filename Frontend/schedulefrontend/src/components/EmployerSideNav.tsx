// app/employermanagement/EmployerSideNav.tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Home,
  Plus,
  Clock,
  CheckSquare,
  Bell,
  Users,
  Settings,
  LogOut,
  AlertTriangle,
} from "lucide-react";

export default function EmployerSideNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = createClientComponentClient();

  const navBase =
    "px-3 py-2 rounded-md flex items-center gap-3 text-sm w-full text-left";
  const inactive = "text-gray-700 hover:bg-gray-50";
  const active = "bg-blue-50 border border-blue-200 text-blue-700";

  const items: { label: string; href: string; icon: React.ReactNode }[] = [
    {
      label: "Home",
      href: "/employermanagement/employerhomepage",
      icon: <Home className="w-4 h-4" />,
    },
    {
      label: "Create Schedule",
      href: "/employermanagement/createschedule",
      icon: <Plus className="w-4 h-4" />,
    },
    {
      label: "Time Off Requests",
      href: "/employermanagement/managetimerequests",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      label: "Availability Requests",
      href: "/employermanagement/availabilityrequest",
      icon: <CheckSquare className="w-4 h-4" />,
    },
    {
      label: "Announcements",
      href: "/employermanagement/makeannouncements",
      icon: <Bell className="w-4 h-4" />,
    },
    {
      label: "Manage dropped shifts",
      href: "/employermanagement/managedroppedshifts",
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    {
      label: "User Management",
      href: "/employermanagement/employeeinvitemanagement/[businessid]",
      icon: <Users className="w-4 h-4" />,
    },
    {
      label: "Settings",
      href: "/employermanagement/settings",
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (_) {
      // ignore
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:h-full w-64 bg-white border-r border-gray-200">
      <div className="px-4 py-6 flex flex-col h-full">
        {/* spacer so the Home button sits lower without re-adding the brand block */}
        <div className="h-12" />

        <nav className="flex-1 space-y-1">
          {items.map((it) => {
            const isActive = pathname.startsWith(it.href.replace(/\/.?\[.*?\]/, ""));
            return (
              <button
                key={it.href}
                onClick={() => {
                  let target = it.href;
                  if (typeof window !== "undefined" && it.href.includes("employeeinvitemanagement")) {
                    const biz = localStorage.getItem("activeBusinessId");
                    if (biz && biz.length > 0) {
                      // If the href contains a bracket placeholder like [businessid], replace it.
                      if (/\[.+?\]/.test(target)) {
                        target = target.replace(/\[.+?\]/, biz);
                      } else {
                        // otherwise append the id (avoid duplicating slashes)
                        target = `${target.replace(/\/+$/g, "")}/${biz}`;
                      }
                    } else {
                      // No active business: remove any bracket placeholder so we go to the listing
                      target = target.replace(/\/?\[.+?\]/, "");
                    }
                  }
                  router.push(target);
                }}
                className={`${navBase} ${isActive ? active : inactive}`}
                aria-current={isActive ? "page" : undefined}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6">
          <button onClick={handleLogout} className={`${navBase} ${inactive}`}>
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

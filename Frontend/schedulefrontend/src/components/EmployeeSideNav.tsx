"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Home, Clock, Calendar, Bell, Settings, LogOut } from "lucide-react";

export default function EmployeeSideNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = createClientComponentClient();

  const navBase = "px-3 py-2 rounded-md flex items-center gap-3 text-sm w-full text-left";
  const inactive = "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800";
  const active = "bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-900 dark:border-blue-800 dark:text-blue-200";

  const items: { label: string; href: string; icon: React.ReactNode }[] = [
    { label: "Home", href: "/employeemanagement/employeehomepage", icon: <Home className="w-4 h-4" /> },
    { label: "Entire schedule", href: "/employeemanagement/entireschedule", icon: <Calendar className="w-4 h-4" /> },
    { label: "Time Off Requests", href: "/employeemanagement/timeoffrequest", icon: <Calendar className="w-4 h-4" /> },
    { label: "Change Availability", href: "/employeemanagement/changeavailability", icon: <Clock className="w-4 h-4" /> },
    { label: "Announcements", href: "/employeemanagement/announcements", icon: <Bell className="w-4 h-4" /> },
    { label: "Settings", href: "/employeemanagement/settings", icon: <Settings className="w-4 h-4" /> },
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
    <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:h-full w-56 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700">
      <div className="p-4">
        <Link href="/employeemanagement/employeehomepage" aria-label="Schedule-It">
          <Image src="/scheduleitlogo.png" alt="Schedule-It" width={36} height={36} priority />
        </Link>
      </div>

      <div className="px-4 py-6 flex flex-col h-full">
        <nav className="flex-1 space-y-1">
          {items.map((it) => {
            const isActive = pathname.startsWith(it.href);
            return (
              <button
                key={it.href}
                onClick={() => router.push(it.href)}
                className={`${navBase} ${isActive ? active : inactive}`}
                aria-current={isActive ? "page" : undefined}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-6 px-4">
          <button onClick={handleLogout} className={`${navBase} ${inactive}`}>
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

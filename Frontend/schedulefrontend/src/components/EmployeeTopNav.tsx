"use client";

import { useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Home, Clock, Calendar, Bell, Settings, LogOut } from "lucide-react";

export default function EmployeeTopNav() {
  const supabase = useRef(createClientComponentClient()).current;
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("activeBusinessId");
      localStorage.removeItem("activeLocationIds");
    }
    router.replace("/");
  };

  const pathname = usePathname() ?? "/";

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
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* left: spacer (brand is fixed elsewhere) */}
          <div className="flex items-center" />

          {/* center/right: unified action group so Home sits with other actions */}
          <div className="flex items-center justify-center w-full">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {btn("Home", <Home className="w-4 h-4" />, "/employeemanagement/employeehomepage", "/employeemanagement/employeehomepage")}
              {btn("Request Time Off", <Clock className="w-4 h-4" />, "/employeemanagement/timeoffrequest")}
              {btn("Change Availability", <Calendar className="w-4 h-4" />, "/employeemanagement/changeavailability")}
              {btn("Announcements", <Bell className="w-4 h-4" />, "/employeemanagement/announcements")}
              {btn("Settings", <Settings className="w-4 h-4" />, "/employeemanagement/settings")}
              <button className={`${base} ${inactive}`} onClick={handleLogout}>
                <LogOut className="w-4 h-4" /> Log out
              </button>
            </div>
          </div>

          {/* right: spacer to keep items centered/consistent */}
          <div className="flex items-center" />
        </div>
      </div>
    </nav>
  );
}

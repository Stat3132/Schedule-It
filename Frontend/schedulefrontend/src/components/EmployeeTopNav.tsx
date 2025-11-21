"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
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

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* left: spacer (brand is fixed elsewhere) */}
          <div className="flex items-center" />

          {/* center/right: unified action group so Home sits with other actions */}
          <div className="flex items-center justify-center w-full">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => router.replace("/employeemanagement/employeehomepage")}
                aria-label="Home"
                title="Home"
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
              >
                <Home className="w-4 h-4" /> Home
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employeemanagement/timeoffrequest")}
              >
                <Clock className="w-4 h-4" /> Request Time Off
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employeemanagement/changeavailability")}
              >
                <Calendar className="w-4 h-4" /> Change Availability
              </button>

              <button className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2">
                <Bell className="w-4 h-4" /> Announcements
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={() => router.push("/employeemanagement/settings")}
              >
                <Settings className="w-4 h-4" /> Settings
              </button>

              <button
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                onClick={handleLogout}
              >
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

// app/employermanagement/EmployerSideNav.tsx
"use client";

import React, { useMemo } from "react";
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
  MessageCircle,
} from "lucide-react";
import { useUnreadFlag } from "../hooks/useUnreadFlag";
import { useUnreadRealtimeBridge } from "../hooks/useUnreadRealtimeBridge";

export default function EmployerSideNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const hasUnreadMessages = useUnreadFlag("employer");

  useUnreadRealtimeBridge("employer", supabase);

  const BUSINESS_PLACEHOLDER = /\[businessid\]/i;

  const normalizePlaceholder = (href: string) => href.replace(/\[businessId\]/g, "[businessid]");
  const placeholderReplacement = /\[businessid\]/gi;

  const resolveHref = (rawHref: string) => {
    const normalized = normalizePlaceholder(rawHref);
    if (!BUSINESS_PLACEHOLDER.test(normalized)) return normalized;

    if (typeof window === "undefined") {
      return normalized.replace(/\/\[businessid\]/gi, "").replace(placeholderReplacement, "");
    }

    const businessId = localStorage.getItem("activeBusinessId");
    if (businessId && businessId.trim().length) {
      return normalized.replace(placeholderReplacement, businessId);
    }

    // No business selected; drop the placeholder segment entirely so the user
    // lands on the parent index page instead of a broken dynamic route.
    return normalized.replace(/\/\[businessid\]/gi, "").replace(placeholderReplacement, "");
  };

  const navBase =
    "px-3 py-2 rounded-md flex items-center gap-3 text-sm w-full text-left";
  const inactive = "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800";
  const active = "bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-900 dark:border-blue-800 dark:text-blue-200";

  const items: { id: string; label: string; href: string; icon: React.ReactNode }[] = [
    {
      id: "home",
      label: "Home",
      href: "/employermanagement/employerhomepage",
      icon: <Home className="w-4 h-4" />,
    },
    {
      id: "create-schedule",
      label: "Create Schedule",
      href: "/employermanagement/createschedule",
      icon: <Plus className="w-4 h-4" />,
    },
    {
      id: "messages",
      label: "Messages",
      href: "/employermanagement/messages",
      icon: <MessageCircle className="w-4 h-4" />,
    },
    {
      id: "time-off",
      label: "Time Off Requests",
      href: "/employermanagement/managetimerequests",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      id: "availability",
      label: "Availability Requests",
      href: "/employermanagement/availabilityrequest",
      icon: <CheckSquare className="w-4 h-4" />,
    },
    {
      id: "announcements",
      label: "Announcements",
      href: "/employermanagement/makeannouncements",
      icon: <Bell className="w-4 h-4" />,
    },
    {
      id: "dropped-shifts",
      label: "Manage dropped shifts",
      href: "/employermanagement/managedroppedshifts",
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    {
      id: "user-management",
      label: "User Management",
      href: "/employermanagement/usermanagement/[businessid]",
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: "settings",
      label: "Settings",
      href: "/employermanagement/settings",
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
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
                  const target = resolveHref(it.href);
                  router.push(target);
                }}
                className={`${navBase} ${isActive ? active : inactive} relative`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative flex items-center justify-center">
                  {hasUnreadMessages && it.id === "messages" ? (
                    <>
                      <span className="sr-only" aria-live="polite">
                        Unread messages
                      </span>
                      <span className="pointer-events-none absolute -left-3 flex h-3 w-3" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/80 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" />
                      </span>
                    </>
                  ) : null}
                  {it.icon}
                </span>
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

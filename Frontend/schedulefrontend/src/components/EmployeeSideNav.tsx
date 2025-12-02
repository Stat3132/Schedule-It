"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Home,
  Clock,
  Calendar,
  Bell,
  Settings,
  LogOut,
  MessageCircle, // ← added
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useUnreadFlag } from "../hooks/useUnreadFlag";
import { useUnreadRealtimeBridge } from "../hooks/useUnreadRealtimeBridge";

export default function EmployeeSideNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { t } = useI18n();
  const hasUnreadMessages = useUnreadFlag("employee");

  useUnreadRealtimeBridge("employee", supabase);

  const navBase =
    "px-3 py-2 rounded-md flex items-center gap-3 text-sm w-full text-left";
  const inactive =
    "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800";
  const active =
    "bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-900 dark:border-blue-800 dark:text-blue-200";

  const items: { id: string; label: string; href: string; icon: React.ReactNode }[] = [
    {
      id: "home",
      label: t("employee.nav.home"),
      href: "/employeemanagement/employeehomepage",
      icon: <Home className="w-4 h-4" />,
    },
    {
      id: "schedule",
      label: t("employee.nav.schedule"),
      href: "/employeemanagement/entireschedule",
      icon: <Calendar className="w-4 h-4" />,
    },
    // ← New Messages nav item
    {
      id: "messages",
      label: t("employee.nav.messages"),
      href: "/employeemanagement/messages", // make sure this matches your messages page route
      icon: <MessageCircle className="w-4 h-4" />,
    },
    {
      id: "time-off",
      label: t("employee.nav.timeOff"),
      href: "/employeemanagement/timeoffrequest",
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      id: "availability",
      label: t("employee.nav.availability"),
      href: "/employeemanagement/changeavailability",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      id: "announcements",
      label: t("employee.nav.announcements"),
      href: "/employeemanagement/announcements",
      icon: <Bell className="w-4 h-4" />,
    },
    {
      id: "settings",
      label: t("employee.nav.settings"),
      href: "/employeemanagement/settings",
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
      <div className="p-4">
        <Link
          href="/employeemanagement/employeehomepage"
          aria-label="Schedule-It"
        >
          <Image
            src="/scheduleitlogo.png"
            alt="Schedule-It"
            width={36}
            height={36}
            priority
          />
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

        <div className="mt-6 px-4">
          <button onClick={handleLogout} className={`${navBase} ${inactive}`}>
            <LogOut className="w-4 h-4" />
            <span>{t("employee.nav.logout")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

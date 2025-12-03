"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  MessageCircle,
  Menu,
  X,
} from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { useUnreadRealtimeBridge } from "../hooks/useUnreadRealtimeBridge";

export default function EmployeeSideNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);
  const { t } = useI18n();
  const unreadCount = useUnreadCount("employee");
  const hasUnreadMessages = unreadCount > 0;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileOverlayMounted, setMobileOverlayMounted] = useState(false);

  useUnreadRealtimeBridge("employee", supabase);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && mobileOverlayMounted) {
      const timeout = window.setTimeout(() => setMobileOverlayMounted(false), 250);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [mobileOpen, mobileOverlayMounted]);

  const openMobileNav = () => {
    setMobileOverlayMounted(true);
    requestAnimationFrame(() => setMobileOpen(true));
  };

  const closeMobileNav = () => {
    setMobileOpen(false);
  };

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

  const activeItemId =
    items.find((it) => pathname.startsWith(it.href))?.id ?? items[0].id;

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

  const renderNavButton = (
    it: (typeof items)[number],
    extraClasses = ""
  ) => {
    const isActive = pathname.startsWith(it.href);
    return (
      <button
        key={it.href}
        onClick={() => router.push(it.href)}
        className={`${navBase} ${isActive ? active : inactive} ${extraClasses}`}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="relative flex items-center justify-center">{it.icon}</span>
        <span>{it.label}</span>
        {hasUnreadMessages && it.id === "messages" ? (
          <>
            <span className="sr-only" aria-live="polite">
              {unreadCount === 1
                ? "1 unread message"
                : `${unreadCount} unread messages`}
            </span>
            <span
              className="ml-auto relative flex min-w-[1.25rem] items-center justify-center"
              aria-hidden="true"
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/80 opacity-75" />
              <span className="relative inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 py-[2px] text-[9px] font-semibold text-white shadow-[0_0_6px_rgba(244,63,94,0.6)]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          </>
        ) : null}
      </button>
    );
  };

  const mobileTagline = t("employee.nav.mobilePlaceholder");
  const brandTagline = t("branding.tagline");

  return (
    <>
      <div className="lg:hidden sticky top-0 z-40 bg-background border-b border-border backdrop-blur">
        <div className="relative flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={openMobileNav}
            className="inline-flex items-center justify-center rounded-md border border-border p-2 text-foreground transition-transform duration-200 hover:scale-105 focus-visible:scale-95 active:scale-95"
            aria-controls="employee-mobile-nav"
            aria-label={t("shared.buttons.openMenu") ?? "Open navigation"}
            aria-expanded={mobileOpen}
          >
            <span
              className={`transition-transform duration-300 ${mobileOpen ? "rotate-90 scale-90" : ""}`}
            >
              <Menu className="h-5 w-5" />
            </span>
          </button>
          <Link
            href="/employeemanagement/employeehomepage"
            aria-label="Schedule-It Home"
            className="pointer-events-auto absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 border-b border-border/80 bg-background/80 px-1 text-sm font-semibold text-primary"
          >
            <Image
              src="/scheduleitlogo.png"
              alt="Schedule-It"
              width={20}
              height={20}
              className="h-6 w-6"
            />
            <span className="leading-none">
              Schedule<span className="text-accent">It</span>
            </span>
          </Link>
          {hasUnreadMessages ? (
            <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-rose-500 px-2 py-[2px] text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : (
            <span className="w-5" aria-hidden="true" />
          )}
        </div>
      </div>

      {mobileOverlayMounted && (
        <div
          id="employee-mobile-nav"
          role="dialog"
          aria-modal="true"
          className={`lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`flex h-full flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${
              mobileOpen ? "translate-y-0" : "-translate-y-4"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-left leading-tight">
                <p className="text-sm font-semibold text-foreground">
                  {t("employee.nav.mobileLabel")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mobileTagline}
                </p>
              </div>
              <button
                type="button"
                onClick={closeMobileNav}
                className="inline-flex items-center justify-center rounded-full border border-border p-2 transition-transform duration-200 hover:scale-110"
                aria-label={t("shared.buttons.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {items.map((it, idx) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    closeMobileNav();
                    router.push(it.href);
                  }}
                  className={`${navBase} ${
                    it.id === activeItemId ? active : inactive
                  } transition-all duration-300`}
                  style={{ transitionDelay: `${idx * 20}ms` }}
                  aria-current={it.id === activeItemId ? "page" : undefined}
                >
                  {it.icon}
                  <span>{it.label}</span>
                  {hasUnreadMessages && it.id === "messages" ? (
                    <span className="ml-auto inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500 px-2 py-[2px] text-[10px] font-semibold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="border-t border-border px-4 py-4">
              <button
                type="button"
                onClick={() => {
                  closeMobileNav();
                  handleLogout();
                }}
                className={`${navBase} ${inactive} justify-center transition-all duration-300`}
              >
                <LogOut className="w-4 h-4" />
                <span>{t("employee.nav.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:h-full w-56 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700">
        <div className="p-4 border-b border-border">
          <Link
            href="/employeemanagement/employeehomepage"
            aria-label="Schedule-It"
            className="flex flex-col items-center text-center gap-2 w-full"
          >
            <Image
              src="/scheduleitlogo.png"
              alt="Schedule-It"
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-xl border border-border bg-background"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-primary">
                Schedule<span className="text-accent">It</span>
              </p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#00a79d]">
                {brandTagline}
              </p>
            </div>
          </Link>
        </div>

        <div className="px-4 py-6 flex flex-col h-full">
          <nav className="flex-1 space-y-1">
            {items.map((it) => renderNavButton(it, "relative"))}
          </nav>

          <div className="mt-6 px-4">
            <button onClick={handleLogout} className={`${navBase} ${inactive}`}>
              <LogOut className="w-4 h-4" />
              <span>{t("employee.nav.logout")}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

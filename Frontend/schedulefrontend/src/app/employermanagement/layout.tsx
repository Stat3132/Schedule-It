"use client";

import React from "react";
import EmployerSideNav from "../../components/EmployerSideNav";

export default function EmployerManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background relative"> {/* mirror employee layout spacing */}
      <EmployerSideNav />
      <div className="hidden lg:block absolute left-56 top-0 h-full w-px bg-gray-200 dark:bg-slate-700" aria-hidden="true" />
      <div className="lg:pl-56">
        <div className="w-full px-4 sm:px-6 lg:px-4">
          <div className="py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

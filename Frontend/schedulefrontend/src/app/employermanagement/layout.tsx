"use client";

import React from "react";
import EmployerSideNav from "../../components/EmployerSideNav";

export default function EmployerManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Single sidebar on the far left */}
      <EmployerSideNav />

      {/* Main content area */}
      <main className="flex-1 lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

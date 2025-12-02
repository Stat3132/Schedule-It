// app/employeemanagement/layout.tsx (or wherever this lives)
import React from "react";
import EmployeeSideNav from "../../components/EmployeeSideNav";
import EmployeeBusinessGate from "../../components/EmployeeBusinessGate";

export default function EmployeeManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background relative"> {/* <- uses --background / respects .dark */}
      <EmployeeSideNav />
      {/* Vertical separator line aligned with the sidebar's right edge */}
      <div className="hidden lg:block absolute left-56 top-0 h-full w-px bg-gray-200 dark:bg-slate-700" aria-hidden="true" />
      <div className="lg:pl-56">
        <div className="w-full px-4 sm:px-6 lg:px-4">
          <EmployeeBusinessGate>
            <div className="py-8">{children}</div>
          </EmployeeBusinessGate>
        </div>
      </div>
    </div>
  );
}

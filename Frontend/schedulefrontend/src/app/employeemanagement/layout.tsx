// app/employeemanagement/layout.tsx (or wherever this lives)
import React from "react";
import EmployeeSideNav from "../../components/EmployeeSideNav";

export default function EmployeeManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background"> {/* <- uses --background / respects .dark */}
      <EmployeeSideNav />
      <div className="lg:pl-56">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

import "./theme.css";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <div className="employee-theme">{children}</div>;
}
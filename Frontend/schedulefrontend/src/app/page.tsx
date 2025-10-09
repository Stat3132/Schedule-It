import Link from "next/link";
import "./globals.css";

export default function Page() {
  return (
    <>
      <span className="brand">Schedule-It</span>

      <main className="shell">
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Pick a role:</h1>
        </div>

        <div className="role-grid">
          <Link href="/employer" className="role-card">
            <h2>Employer</h2>
            <div className="avatar" />
          </Link>
          <Link href="/employee" className="role-card">
            <h2>Employee</h2>
            <div className="avatar" />
          </Link>
        </div>
      </main>
    </>
  );
}   

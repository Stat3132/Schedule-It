import Image from "next/image";
import Link from "next/link";

export default function Brand() {
  return (
    <Link
      href="/"
      aria-label="Schedule-It"
      className="fixed top-4 left-4 z-50 flex items-center gap-3"
    >
      <Image
        src="/scheduleitlogo.png"
        alt="Schedule-It"
        width={36}
        height={36}
        priority
      />
      <div className="leading-tight">
        <div className="text-xl font-semibold" style={{ color: "var(--primary)" }}>
          Schedule<span style={{ color: "var(--accent)" }}>It</span>
        </div>
        <div className="text-xs tracking-widest" style={{ color: "var(--secondary)" }}>
          Schedule it your way!
        </div>
      </div>
    </Link>
  );
}

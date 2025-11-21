"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Brand() {
  const pathname = usePathname() ?? "/";

  let href = "/";
  if (pathname.startsWith("/employermanagement"))
    href = "/employermanagement/employerhomepage";
  else if (pathname.startsWith("/employeemanagement"))
    href = "/employeemanagement/employeehomepage";

  return (
    <Link
      href={href}
      aria-label="Schedule-It"
      className="
        fixed 
        top-4 
        left-4      /* <<< moved back fully to the left */
        z-50 
        flex 
        items-center 
        gap-3
      "
    >
      <Image
        src="/scheduleitlogo.png"
        alt="Schedule-It"
        width={36}
        height={36}
        priority
      />

      <div className="leading-tight">
        <div className="text-xl font-semibold text-primary">
          Schedule<span className="text-accent">It</span>
        </div>
        <div className="text-xs tracking-widest text-secondary">
          Schedule it your way!
        </div>
      </div>
    </Link>
  );
}

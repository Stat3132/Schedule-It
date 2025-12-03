"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

function Wordmark({ isDesktop }: { isDesktop: boolean }) {
  return (
    <>
      <Image
        src="/scheduleitlogo.png"
        alt="Schedule-It"
        width={isDesktop ? 40 : 36}
        height={isDesktop ? 40 : 36}
        priority
      />

      <div className="leading-tight">
        <div
          className={`${isDesktop ? "text-xl" : "text-lg"} font-semibold text-primary`}
        >
          Schedule<span className="text-accent">It</span>
        </div>
        <div
          className={`${
            isDesktop ? "text-xs" : "text-[10px]"
          } uppercase tracking-[0.2em] text-secondary`}
        >
          Schedule it your way!
        </div>
      </div>
    </>
  );
}

export default function Brand() {
  const pathname = usePathname() ?? "/";
  const isEmployeeRoute = pathname.startsWith("/employeemanagement");
  const isEmployerRoute = pathname.startsWith("/employermanagement");

  let href = "/";
  if (pathname.startsWith("/employermanagement"))
    href = "/employermanagement/employerhomepage";

  if (isEmployeeRoute || isEmployerRoute) {
    return null;
  }

  return (
    <>
      <Link
        href={href}
        aria-label="Schedule-It"
        className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 flex-col items-center gap-2 text-center transition-all duration-200 md:hidden"
      >
        <Wordmark isDesktop={false} />
      </Link>

      <Link
        href={href}
        aria-label="Schedule-It"
        className="fixed left-4 top-4 z-50 hidden -translate-x-0 flex-row items-center gap-3 text-left transition-all duration-200 md:flex"
      >
        <Wordmark isDesktop />
      </Link>
    </>
  );
}

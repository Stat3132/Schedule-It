import type { ReactNode } from "react";
import ThemeModeSlider from "@/components/ui/ThemeModeSlider";

export default function EmployerOnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ThemeModeSlider positionClass="fixed top-1/2 right-6 -translate-y-1/2" />
    </>
  );
}

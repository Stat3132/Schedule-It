"use client";
import "./globals.css";

import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, User } from "lucide-react";
import { useRouter } from "next/navigation";
import ThemeModeSlider from "@/components/ui/ThemeModeSlider";

export default function Page() {
  const router = useRouter();

  const handleRoleSelection = (role: "employer" | "employee") => {
    router.push(role === "employer" ? "/employerregistration" : "/employeeregistration");
  };

  return (
    <>
      <div className="min-h-screen bg-background px-6 pb-12 pt-40 sm:pt-48 md:pb-16 md:pt-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-12 text-center">
          <div className="space-y-2 md:space-y-3">
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Pick a role:</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Choose how you would like to continue.
            </p>
          </div>
          <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-8">
            <Card
              className="w-full cursor-pointer border-2 transition-all hover:scale-[1.02] hover:border-primary hover:shadow-xl sm:w-64"
              onClick={() => handleRoleSelection("employer")}
            >
              <CardContent className="flex flex-col items-center justify-center space-y-4 p-8">
                <h3 className="text-secondary">Employer</h3>
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary/10">
                  <Briefcase className="size-16 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card
              className="w-full cursor-pointer border-2 transition-all hover:scale-[1.02] hover:border-secondary hover:shadow-xl sm:w-64"
              onClick={() => handleRoleSelection("employee")}
            >
              <CardContent className="flex flex-col items-center justify-center space-y-4 p-8">
                <h3 className="text-secondary">Employee</h3>
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-secondary/10">
                  <User className="size-16 text-secondary" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <ThemeModeSlider positionClass="fixed bottom-6 right-6" />
    </>
  );
}

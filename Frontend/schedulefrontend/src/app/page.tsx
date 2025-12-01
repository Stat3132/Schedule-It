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
      <div className="min-h-screen bg-background px-6 py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-12 text-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Pick a role:</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose how you would like to continue.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <Card
              className="w-64 cursor-pointer border-2 transition-all hover:scale-105 hover:border-primary hover:shadow-xl"
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
              className="w-64 cursor-pointer border-2 transition-all hover:scale-105 hover:border-secondary hover:shadow-xl"
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

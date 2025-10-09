import Link from "next/link";
import "./globals.css";

import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, User } from "lucide-react";

export default function Page() {
  const handleRoleSelection = (role: "employer" | "employee") => {
    console.log(`Selected role: ${role}`);
    // Add your navigation logic here
  };

  return (
    <div className="size-full bg-background p-8">
      {/* Schedule-It Logo */}
      <div className="mb-16">
        <h1 className="text-primary">Schedule-It</h1>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center">
        <h2 className="mb-12 text-foreground">Pick a role:</h2>

        {/* Role Cards */}
        <div className="flex gap-8 flex-wrap justify-center">
          {/* Employer Card */}
          <Card
            className="w-64 cursor-pointer transition-all hover:shadow-xl hover:scale-105 border-2 hover:border-primary"
            onClick={() => handleRoleSelection("employer")}
          >
            <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
              <h3 className="text-secondary">Employer</h3>
              <div className="flex items-center justify-center w-32 h-32 rounded-full bg-primary/10">
                <Briefcase className="size-16 text-primary" />
              </div>
            </CardContent>
          </Card>

          {/* Employee Card */}
          <Card
            className="w-64 cursor-pointer transition-all hover:shadow-xl hover:scale-105 border-2 hover:border-secondary"
            onClick={() => handleRoleSelection("employee")}
          >
            <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
              <h3 className="text-secondary">Employee</h3>
              <div className="flex items-center justify-center w-32 h-32 rounded-full bg-secondary/10">
                <User className="size-16 text-secondary" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

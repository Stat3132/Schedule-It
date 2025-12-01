"use client";

import { useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const supabase = createClientComponentClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<
    | { type: "success" | "error" | "info"; text: string }
    | null
  >(null);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || !confirmPassword.trim()) {
      setMessage({ type: "info", text: "Enter and confirm a new password." });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords must match." });
      return;
    }
    if (password.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }
      setMessage({ type: "success", text: "Password updated. You can now sign in." });
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Password update failed:", error);
      setMessage({ type: "error", text: "Unable to update password. Try the link again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-center mb-2">Reset password</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          This form opens after you click the reset link in your email.
        </p>
        {message ? (
          <div
            className={`mb-4 rounded-md border p-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : message.type === "info"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}
        <form className="space-y-4" onSubmit={handleReset}>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating..." : "Update password"}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Need to sign back in?</p>
          <div className="mt-1 flex items-center justify-center gap-4">
            <Link className="text-primary hover:underline" href="/employeeregistration">
              Employee login
            </Link>
            <span className="text-border">|</span>
            <Link className="text-primary hover:underline" href="/employerregistration">
              Employer login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

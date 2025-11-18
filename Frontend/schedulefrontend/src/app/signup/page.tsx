// app/employee-signup/page.tsx
"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function SignUp() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClientComponentClient();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    verifyPassword: "",
  });

  const roleAtSignup: "employee" | "employer" = "employee";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.verifyPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const inviteToken = params.get("token") ?? "";
      const nextPath = `/business-selection${
        inviteToken ? `?token=${encodeURIComponent(inviteToken)}` : ""
      }`;

      const origin = window.location.origin;
      const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
        nextPath
      )}`;

      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo,
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            role: roleAtSignup,
          },
        },
      });

      if (error) {
        throw error;
      }

      // If email confirmations are OFF and we already have a session,
      // just go straight to business-selection.
      if (data.session) {
        router.push(nextPath);
        return;
      }

      // Email confirmations ON: user must click the link in their email.
      setMessage({
        type: "success",
        text:
          "Account created. Check your email and click the confirmation link to continue.",
      });

      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        verifyPassword: "",
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text:
          (err as { message?: string })?.message ??
          "Unexpected error during sign up",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-primary px-8 py-10">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                <User className="w-10 h-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-primary-foreground text-center">
              Sign Up
            </h1>
            <p className="text-primary-foreground/80 text-center mt-2">
              Start your scheduling journey
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-10">
            {message && (
              <div
                className={`mb-4 p-3 rounded ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "bg-red-50 text-red-700 border border-red-100"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  First name
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Enter your first name"
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  Last name
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Enter your last name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="user@gmail.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Create a secure password"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Must be at least 8 characters
                </p>
              </div>

              <div>
                <label
                  htmlFor="verifyPassword"
                  className="block text-sm font-semibold text-foreground mb-2"
                >
                  Verify password
                </label>
                <input
                  type="password"
                  id="verifyPassword"
                  name="verifyPassword"
                  value={formData.verifyPassword}
                  onChange={handleChange}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Confirm password above"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Must match the password above
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-8 bg-primary text-primary-foreground py-4 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl ${
                loading ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Creating..." : "Next"}
            </button>
          </form>
        </div>

        <p className="text-center text-muted-foreground mt-6 text-sm">
          By registering, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}

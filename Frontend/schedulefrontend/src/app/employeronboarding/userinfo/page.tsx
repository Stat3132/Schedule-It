// app/userinfo/page.tsx
"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import ThemeModeSlider from "@/components/ui/ThemeModeSlider";
import { Button } from "@/components/ui/button";
import NextImage from "next/image";

type Form = {
  ownerFirstName: string;
  ownerLastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  verifyPassword: string;
};

export default function UserInfo() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [formData, setFormData] = useState<Form>({
    ownerFirstName: "",
    ownerLastName: "",
    email: "",
    phoneNumber: "",
    password: "",
    verifyPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<
    | {
        type: "success" | "error";
        text: string;
      }
    | null
  >(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((s) => ({ ...s, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (formData.password !== formData.verifyPassword) {
      setNotice({ type: "error", text: "Passwords do not match" });
      return;
    }

    setLoading(true);

    // Keep for later display if needed
    localStorage.setItem(
      "signupDisplayName",
      `${formData.ownerFirstName} ${formData.ownerLastName}`.trim()
    );
    localStorage.setItem("pendingEmail", formData.email);

    const origin = window.location.origin;
    const next = "/employeronboarding/bootstrap";

    // After confirming email, Supabase redirects here with either
    // ?code=... or ?token_hash=...&type=signup, and our /auth/callback
    // route turns that into a real session then forwards to `next`.
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      next
    )}`;

    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        emailRedirectTo,
        data: {
          first_name: formData.ownerFirstName,
          last_name: formData.ownerLastName,
          phone: formData.phoneNumber,
          role: "employer",
        },
      },
    });

    console.debug("employer signUp result", { data, error });

    if (error) {
      setNotice({ type: "error", text: error.message });
      setLoading(false);
      return;
    }

    if (!data.session) {
      // Email confirmation ON → wait for user to click confirm link
      setNotice({
        type: "success",
        text: "Verify your email and click the link to continue.",
      });
      setLoading(false);
      return;
    }

    // Email confirmation OFF → session already exists, go straight to bootstrap
    router.replace(next);
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <ThemeModeSlider positionClass="fixed bottom-4 right-4" />

      <button
        type="button"
        aria-label="Go back"
        onClick={() => router.back()}
        className="absolute left-4 top-6 z-20 rounded-full border border-border bg-background/80 p-2 text-foreground shadow-sm backdrop-blur md:hidden"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="fixed bottom-4 left-4 z-20 hidden md:block">
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
          Back
        </Button>
      </div>

      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center md:hidden">
          <NextImage
            src="/scheduleitlogo.png"
            alt="Schedule-It"
            width={64}
            height={64}
            priority
          />
          <p className="text-2xl font-semibold text-primary">
            Schedule<span className="text-accent">It</span>
          </p>
          <p className="text-[11px] uppercase tracking-[0.3em] text-secondary">
            Schedule it your way!
          </p>
        </div>
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-primary px-8 py-10 text-center text-primary-foreground">
            <div className="mx-auto mb-4 w-16 h-16 grid place-items-center rounded-2xl bg-white/10">
              <Building2 className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold">Employer Sign Up</h1>
            <p className="opacity-90 mt-2">We’ll create your business after sign-in</p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-10">
            {notice && (
              <div
                className={`mb-4 rounded border p-3 text-sm ${
                  notice.type === "success"
                    ? "border-green-100 bg-green-50 text-green-700"
                    : "border-red-100 bg-red-50 text-red-700"
                }`}
              >
                {notice.text}
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label htmlFor="ownerFirstName" className="mb-2 block text-sm font-semibold text-foreground">
                  Owner first name
                </label>
                <input
                  id="ownerFirstName"
                  name="ownerFirstName"
                  value={formData.ownerFirstName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:border-transparent focus:ring-2 focus:ring-ring transition"
                  placeholder="Enter your first name"
                />
              </div>

              <div>
                <label htmlFor="ownerLastName" className="mb-2 block text-sm font-semibold text-foreground">
                  Owner last name
                </label>
                <input
                  id="ownerLastName"
                  name="ownerLastName"
                  value={formData.ownerLastName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:border-transparent focus:ring-2 focus:ring-ring transition"
                  placeholder="Enter your last name"
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-foreground">
                  Email address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:border-transparent focus:ring-2 focus:ring-ring transition"
                  placeholder="owner@business.com"
                />
              </div>

              <div>
                <label htmlFor="phoneNumber" className="mb-2 block text-sm font-semibold text-foreground">
                  Phone number
                </label>
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:border-transparent focus:ring-2 focus:ring-ring transition"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-foreground">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  minLength={8}
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:border-transparent focus:ring-2 focus:ring-ring transition"
                  placeholder="Create a secure password"
                />
                <p className="mt-1 text-sm text-muted-foreground">Must be at least 8 characters</p>
              </div>

              <div>
                <label htmlFor="verifyPassword" className="mb-2 block text-sm font-semibold text-foreground">
                  Confirm password
                </label>
                <input
                  type="password"
                  id="verifyPassword"
                  name="verifyPassword"
                  minLength={8}
                  value={formData.verifyPassword}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:border-transparent focus:ring-2 focus:ring-ring transition"
                  placeholder="Confirm password above"
                />
                <p className="mt-1 text-sm text-muted-foreground">Must match the password above</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-8 rounded-lg bg-primary py-4 font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90 hover:shadow-xl ${
                loading ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              {loading ? "Working…" : "Proceed"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          By registering, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}

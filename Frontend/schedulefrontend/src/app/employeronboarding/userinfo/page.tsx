// app/userinfo/page.tsx
"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

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
  const [notice, setNotice] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((s) => ({ ...s, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (formData.password !== formData.verifyPassword) {
      setNotice("Passwords do not match");
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

    // eslint-disable-next-line no-console
    console.debug("employer signUp result", { data, error });

    if (error) {
      setNotice(error.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      // Email confirmation ON → wait for user to click confirm link
      setNotice("VERIFY YOUR EMAIL TO CONTINUE");
      setLoading(false);
      return;
    }

    // Email confirmation OFF → session already exists, go straight to bootstrap
    router.replace(next);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
          <div className="bg-primary px-8 py-10 text-center text-primary-foreground">
            <div className="mx-auto mb-4 w-12 h-12 grid place-items-center rounded-xl bg-white/10">
              <Building2 className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold">User Registration</h1>
            <p className="opacity-90 mt-2">
              We’ll create your business after sign-in
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-10 space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Owner First Name
              </label>
              <input
                name="ownerFirstName"
                value={formData.ownerFirstName}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Owner Last Name
              </label>
              <input
                name="ownerLastName"
                value={formData.ownerLastName}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Phone Number
              </label>
              <input
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                minLength={8}
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                name="verifyPassword"
                minLength={8}
                value={formData.verifyPassword}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              {loading ? "Working…" : "Proceed"}
            </button>

            {notice && (
              <p
                className={`text-center text-sm mt-3 ${
                  /verify/i.test(notice)
                    ? "text-red-600"
                    : "text-foreground"
                }`}
              >
                {notice}
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-muted-foreground mt-6 text-sm">
          By registering, you agree to our terms of service and privacy policy
        </p>
      </div>
    </div>
  );
}

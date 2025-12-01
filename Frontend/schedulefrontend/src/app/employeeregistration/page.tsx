// app/employee/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import {
  clearRememberedEmail,
  loadRememberedEmail,
  saveRememberedEmail,
} from "@/lib/rememberMe";

export default function EmployeePage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [remember, setRemember] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const remembered = loadRememberedEmail("employee");
    if (remembered?.email) {
      setFormData((prev) => ({ ...prev, email: remembered.email }));
      setRemember(true);
    }
  }, []);

  useEffect(() => {
    if (!remember) {
      clearRememberedEmail("employee");
      return;
    }
    if (formData.email.trim()) {
      saveRememberedEmail("employee", formData.email);
    }
  }, [remember, formData.email]);

  useEffect(() => {
    if (showResetForm) {
      setResetEmail((prev) => (prev ? prev : formData.email));
    }
  }, [showResetForm, formData.email]);

  async function handlePasswordReset() {
    if (!resetEmail.trim()) {
      setMessage({ type: 'info', text: 'Provide the email you use to sign in and try again.' });
      return;
    }

    setResetting(true);
    setMessage(null);
    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo });
      if (error) {
        throw error;
      }
      setMessage({ type: 'success', text: 'Check your inbox for a password reset link.' });
      setShowResetForm(false);
      setResetEmail('');
    } catch (error) {
      console.error('Employee reset error:', error);
      setMessage({ type: 'error', text: 'Unable to send reset email. Please try again.' });
    } finally {
      setResetting(false);
    }
  }

    async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      if (error.message.toLowerCase().includes('confirm')) {
        setMessage({ type: 'info', text: 'Confirm your email, then try again.' });
        setLoading(false);
        return;
      }
      setMessage({ type: 'error', text: 'Invalid email or password.' });
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setMessage({ type: 'error', text: 'Unable to verify your account. Please try again.' });
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Profile lookup failed:', profileError);
      setMessage({ type: 'error', text: 'Unable to verify your account role. Please try again.' });
      setLoading(false);
      await supabase.auth.signOut();
      return;
    }

      if (profile?.role !== 'employee') {
        await supabase.auth.signOut();
        setMessage({ type: 'error', text: 'Wrong login. Employer role has been detected.' });
        setLoading(false);
        return;
      }

    setLoading(false);
    router.push('/employeemanagement/employeehomepage');
  }

  return (
    <div className="relative min-h-screen w-full bg-muted/30 flex items-center justify-center p-6">
      <div className="absolute bottom-4 left-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.back()}
        >
          Back
        </Button>
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Welcome Back</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={signIn}>
            {message && (
              <div className={`mb-2 p-2 rounded ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : message.type === 'info' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {message.text}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} type="email" placeholder="you@example.com" className="pl-9" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} type="password" placeholder="••••••••" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                />
                <Label htmlFor="remember" className="font-normal">
                  Remember me
                </Label>
              </div>
              <button
                type="button"
                onClick={() => setShowResetForm((prev) => !prev)}
                className="text-sm text-primary hover:underline"
              >
                {showResetForm ? 'Hide reset' : 'Forgot password?'}
              </button>
            </div>

            {showResetForm && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-2">
                <Label htmlFor="employee-reset-email">Send reset link to</Label>
                <Input
                  id="employee-reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <Button type="button" size="sm" disabled={resetting} className="w-full" onClick={handlePasswordReset}>
                  {resetting ? 'Sending…' : 'Email reset link'}
                </Button>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <div className="my-6 flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">Or continue with</span>
              <Separator className="flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" className="w-full">
                <span className="mr-2 font-semibold">G</span> Google
              </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                  const redirectTo = `${window.location.origin}/addcorptouser`;
                  await supabase.auth.signInWithOAuth({
                  provider: "azure",
                  options: { redirectTo, queryParams: { prompt: "select_account" } },
                  
              });
              
              }}
              >

                <span className="mr-2 font-semibold">▦</span> Microsoft
              </Button>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

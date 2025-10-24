"use client";
import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useRouter } from "next/navigation";
import {supabase} from '../../../lib/supabase';

export default function UserInfo() {
    const router = useRouter();
  const [formData, setFormData] = useState({
    ownerFirstName: '',
    ownerLastName: '',
    email: '',
    phoneNumber: '',
    password: '',
    verifyPassword: '',
  });
   const roleAtSignup: "employee" | "employer" = "employer";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (formData.password !== formData.verifyPassword) {
        setMessage({ type: 'error', text: 'Passwords do not match' });
        return;
      }
      setLoading(true);
      setMessage(null);
      try { 
        const { error } = await supabase.auth.signUp(
          {
            email: formData.email,
            password: formData.password,
            options: {
              data: {
              first_name: formData.ownerFirstName,
              last_name: formData.ownerLastName,
              phone: formData.phoneNumber,
              role: roleAtSignup
              }
            },
          }
          );
        localStorage.setItem("pendingEmail", formData.email);
        localStorage.setItem("pendingName", `${formData.ownerFirstName} ${formData.ownerLastName}`);
        router.push('/employeronboarding/businessVerification');
        if (error) throw error;
        setMessage({ type: 'success', text: 'User created successfully!' });
        setFormData({ownerFirstName: '', ownerLastName: '', email: '', phoneNumber: '', password: '', verifyPassword: ''});
        ;
    }
      catch (err: unknown) {
      setMessage({ type: 'error', text: (err as { message?: string })?.message ?? 'Unexpected error' });
    } finally {
      setLoading(false);
    }
    };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {message && (
          <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
            {message.text}
          </div>
        )}
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-primary px-8 py-10">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                <Building2 className="w-10 h-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-primary-foreground text-center">
              User Registration
            </h1>
            <p className="text-primary-foreground/80 text-center mt-2">
              Register your business and get started today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-10">
            <div className="space-y-6">
              
              <div>
                <label htmlFor="ownerFirstName" className="block text-sm font-semibold text-foreground mb-2">
                  Owner First Name
                </label>
                <input
                  type="text"
                  id="ownerFirstName"
                  name="ownerFirstName"
                  value={formData.ownerFirstName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Enter owner's full name"
                />
              </div>
              <div>
                <label htmlFor="ownerLastName" className="block text-sm font-semibold text-foreground mb-2">
                  Owner Last Name
                </label>
                <input
                  type="text"
                  id="ownerLastName"
                  name="ownerLastName"
                  value={formData.ownerLastName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Enter owner's full name"
                />
              </div>


              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="owner@business.com"
                />
              </div>

              <div>
                <label htmlFor="phoneNumber" className="block text-sm font-semibold text-foreground mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-2">
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
                <p className="text-sm text-muted-foreground mt-1">Must be at least 8 characters</p>
              </div>
              <div>
                <label htmlFor="verifyPassword" className="block text-sm font-semibold text-foreground mb-2">
                  Confirm Password
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
                  placeholder="Create a secure password"
                />
                <p className="text-sm text-muted-foreground mt-1">Must be at least 8 characters</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-8 bg-primary text-primary-foreground py-4 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Proceed'}
            </button>
          </form>
        </div>

        <p className="text-center text-muted-foreground mt-6 text-sm">
          By registering, you agree to our terms of service and privacy policy
        </p>
      </div>
    </div>
  );
}

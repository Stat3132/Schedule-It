"use client";
import { useState } from 'react';
import { User } from 'lucide-react';

export default function SignUp() {
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    location: '',
    email: '',
    password: '',
    phoneNumber: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
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
            <div className="space-y-6">
              <div>
                <label htmlFor="businessName" className="block text-sm font-semibold text-foreground mb-2">
                  Full name
                </label>
                <input
                  type="text"
                  id="businessName"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Enter your business name"
                />
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-semibold text-foreground mb-2">
                  Zipcode
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent transition-all bg-background text-foreground"
                  placeholder="Enter business location"
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
            </div>

            <button
              type="submit"
              className="w-full mt-8 bg-primary text-primary-foreground py-4 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl"
            >
              Register
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

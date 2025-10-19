"use client";
import { useState, useEffect } from 'react';
import { Building2, Mail, User, Check } from 'lucide-react';

interface CreateBusinessProps {
  email: string;
  displayName: string;
  onContinue: () => void;
}

export default function CreateBusiness({ email, displayName, onContinue }: CreateBusinessProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(userTimezone);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOwner || !agreedToTerms) {
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      onContinue();
    }, 1000);
  };

  const isFormValid = isOwner && agreedToTerms;

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-slate-800 mb-8">
          Create your business
        </h1>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 p-2 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-600">Email</span>
              </div>
              <p className="text-slate-800 font-semibold mb-3">{email}</p>

              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-600">Display Name</span>
              </div>
              <p className="text-slate-800 font-semibold">{displayName}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border-2 border-slate-200 rounded-xl p-4 hover:border-blue-300 transition">
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative flex items-center justify-center mt-1">
                <input
                  type="radio"
                  checked={isOwner}
                  onChange={(e) => setIsOwner(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-slate-300 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  required
                />
              </div>
              <div className="flex-1">
                <span className="block font-semibold text-slate-800 mb-1">
                  I am the owner/authorized officer
                  <span className="text-red-500 ml-1">*</span>
                </span>
                <span className="text-sm text-slate-600">
                  You confirm that you have the authority to create and manage this business
                </span>
              </div>
            </label>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-semibold text-slate-700 mb-2">
              Primary timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="border-2 border-slate-200 rounded-xl p-4 hover:border-blue-300 transition">
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative flex items-center justify-center mt-1">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  required
                />
              </div>
              <div className="flex-1">
                <span className="block text-slate-800">
                  I agree to the{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-700 font-medium underline">
                    Terms of Service
                  </a>
                  <span className="text-red-500 ml-1">*</span>
                </span>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition flex items-center justify-center gap-2 group"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating business...
              </>
            ) : (
              <>
                Create business & continue
                <Check className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-6">
          By creating a business, you agree to our policies and authorize us to process your business information.
        </p>
      </div>
    </div>
  );
}

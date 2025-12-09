"use client";

import Image from "next/image";
import {
  Calendar,
  Users,
  MessageSquare,
  Shield,
  Zap,
  Database,
  Server,
  Lock,
  Globe,
  Clock,
  Settings,
  UserCheck,
  Briefcase,
  FileText,
} from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mx-auto mb-8 flex flex-col items-center gap-2">
              <Image
                src="/scheduleitlogo.png"
                alt="Schedule-It"
                width={80}
                height={80}
                className="drop-shadow-lg"
              />
              {/* Brand wordmark – matches Brand.tsx style */}
              <div className="leading-tight">
                <div className="text-4xl font-semibold text-primary">
                  Schedule<span className="text-accent">It</span>
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-secondary md:text-sm">
                  Schedule it your way!
                </div>
              </div>
            </div>

           
            <p className="mt-2 text-lg opacity-75">Diego Perez Benitez</p>
          </div>
        </div>
      </div>

      {/* Tech Stack Section */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-gray-900">
            Tech Stack Summary
          </h2>
          <p className="text-lg text-gray-600">
            Built with modern technologies for reliability and performance
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Frontend */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Frontend
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <strong className="text-gray-900">React:</strong>
                <span className="ml-1 text-gray-600">
                  Used to build all UI pages and components.
                </span>
              </div>
              <div>
                <strong className="text-gray-900">TypeScript:</strong>
                <span className="ml-1 text-gray-600">
                  Provides type safety and prevents runtime errors.
                </span>
              </div>
              <div>
                <strong className="text-gray-900">Tailwind:</strong>
                <span className="ml-1 text-gray-600">
                  Handles styling directly in components for fast, consistent UI
                  design.
                </span>
              </div>
            </div>
          </div>

          {/* Backend */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <Server className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Backend
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <strong className="text-gray-900">Next.js:</strong>
                <span className="ml-1 text-gray-600">
                  Provides server-side logic, API routes, secure actions, and
                  routing.
                </span>
              </div>
              <div>
                <strong className="text-gray-900">
                  Supabase Edge Functions:
                </strong>
                <span className="ml-1 text-gray-600">
                  Run serverless backend tasks close to the database for
                  performance and controlled business logic.
                </span>
              </div>
            </div>
          </div>

          {/* Authentication */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <Lock className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Authentication
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <strong className="text-gray-900">Supabase Auth:</strong>
                <span className="ml-1 text-gray-600">
                  Manages user accounts, sessions, and triggers that sync data
                  into the profiles table.
                </span>
              </div>
              <div>
                <strong className="text-gray-900">Microsoft OAuth:</strong>
                <span className="ml-1 text-gray-600">
                  Offers an additional sign-in option through the same auth
                  system.
                </span>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                <Database className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Database
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <strong className="text-gray-900">Supabase Postgres:</strong>
                <span className="ml-1 text-gray-600">
                  Central relational database storing businesses, employees,
                  schedules, roles, requests, and messages.
                </span>
              </div>
              <div>
                <strong className="text-gray-900">
                  Row-Level Security (RLS):
                </strong>
                <span className="ml-1 text-gray-600">
                  Ensures each business only accesses its own data.
                </span>
              </div>
            </div>
          </div>

          {/* Deployment */}
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                <Globe className="h-6 w-6 text-gray-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Deployment
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <strong className="text-gray-900">Vercel:</strong>
                <span className="ml-1 text-gray-600">
                  Hosts the entire Next.js app (frontend + backend).
                </span>
              </div>
              <div>
                <span className="text-gray-600">
                  Provides automatic builds, scaling, and integration with
                  Supabase environment variables.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Functionality Section */}
      <div className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900">
              Functionality Overview
            </h2>
            <p className="text-lg text-gray-600">
              Comprehensive features for employers and employees
            </p>
          </div>

          {/* Employer Functionality */}
          <div className="mb-16">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center rounded-full bg-blue-100 px-4 py-2">
                <Briefcase className="mr-2 h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  Employer Functionality
                </span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Business & Team Management */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Users className="mr-3 h-6 w-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Business &amp; Team Management
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Create and manage businesses, roles, and locations</li>
                  <li>Assign managers and adjust employee permissions</li>
                  <li>Review, approve, or deny join requests</li>
                  <li>Manage employment status (active, invited, terminated)</li>
                </ul>
              </div>

              {/* Scheduling */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Calendar className="mr-3 h-6 w-6 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Scheduling
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Create, edit, and publish shifts</li>
                  <li>Assign employees to shifts or offer shifts for pickup</li>
                  <li>View employee availability and make scheduling decisions</li>
                  <li>Monitor shift assignment statuses</li>
                </ul>
              </div>

              {/* Availability & Time-Off Oversight */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Clock className="mr-3 h-6 w-6 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Availability &amp; Time-Off Oversight
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>View employee availability patterns</li>
                  <li>Review, approve, or deny time-off requests</li>
                  <li>Modify availability entries if required</li>
                </ul>
              </div>

              {/* Communication & Announcements */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <MessageSquare className="mr-3 h-6 w-6 text-orange-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Communication &amp; Announcements
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Post business-wide announcements with attachments</li>
                  <li>Track which employees have read announcements</li>
                  <li>Participate in direct messages and group chats</li>
                  <li>Manage group membership and moderate conversations</li>
                </ul>
              </div>

              {/* Verification & Documentation */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <FileText className="mr-3 h-6 w-6 text-red-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Verification &amp; Documentation
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Upload business verification documents</li>
                  <li>Track verification status and review documents</li>
                  <li>Complete domain verification via email or DNS</li>
                </ul>
              </div>

              {/* Administrative Tools */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Settings className="mr-3 h-6 w-6 text-gray-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Administrative Tools
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Update business settings (timezone, operating hours)</li>
                  <li>Access restricted views powered by RLS</li>
                  <li>Moderate users through blocking or removing roles</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Employee Functionality */}
          <div>
            <div className="mb-8 text-center">
              <div className="inline-flex items-center rounded-full bg-green-100 px-4 py-2">
                <UserCheck className="mr-2 h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Employee Functionality
                </span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Onboarding */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <UserCheck className="mr-3 h-6 w-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Onboarding
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Join a business through a join request</li>
                  <li>Set initial profile details and update information</li>
                </ul>
              </div>

              {/* Scheduling Participation */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Calendar className="mr-3 h-6 w-6 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Scheduling Participation
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>View published schedules and assigned shifts</li>
                  <li>Accept, decline, or drop assigned shifts</li>
                  <li>Request pickup for eligible open shifts</li>
                </ul>
              </div>

              {/* Availability & Time-Off */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Clock className="mr-3 h-6 w-6 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Availability &amp; Time-Off
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Submit weekly availability patterns</li>
                  <li>Update availability when schedules change</li>
                  <li>Request time off with detailed reasoning</li>
                </ul>
              </div>

              {/* Communication */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <MessageSquare className="mr-3 h-6 w-6 text-orange-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Communication
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Receive announcements from managers</li>
                  <li>Participate in direct and group messaging</li>
                  <li>Send and receive attachments</li>
                  <li>Mute threads or block users if necessary</li>
                </ul>
              </div>

              {/* Profile & Authentication */}
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center">
                  <Shield className="mr-3 h-6 w-6 text-red-600" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Profile &amp; Authentication
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>Log in using Supabase Auth or Microsoft OAuth</li>
                  <li>
                    Manage personal profile data and update photo, display name,
                    and contact details
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="border-t border-gray-800 pt-8">
            <p className="text-sm text-gray-400">
              Check the app out now!
            </p>
          </div>
        </div>
      </div>
    </div>

  );
}

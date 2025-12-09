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
  CheckCircle,
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
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
              <Image
                src="/scheduleitlogo.png"
                alt="Schedule-It"
                width={80}
                height={80}
                className="drop-shadow-lg"
              />
            </div>
            <h1 className="mb-4 text-5xl font-bold tracking-tight">
              Schedule<span className="text-yellow-300">IT</span>
            </h1>
            <p className="text-xl font-light opacity-90">
              &quot;Schedule it your way&quot;
            </p>
            <p className="mt-2 text-lg opacity-75">
              Diego Perez Benitez - Info Doc
            </p>
          </div>
        </div>
      </div>

      {/* Tech Stack Section */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Tech Stack Summary – Schedule-It
          </h2>
          <p className="text-lg text-gray-600">
            Built with modern technologies for reliability and performance
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Frontend */}
          <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100">
            <div className="flex items-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Zap className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Frontend
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">React:</strong>
                  <span className="text-gray-600 ml-1">
                    Used to build all UI pages and components.
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">TypeScript:</strong>
                  <span className="text-gray-600 ml-1">
                    Provides type safety and prevents runtime errors.
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Tailwind:</strong>
                  <span className="text-gray-600 ml-1">
                    Handles styling directly in components for fast, consistent UI design.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Backend */}
          <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100">
            <div className="flex items-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <Server className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Backend
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Next.js:</strong>
                  <span className="text-gray-600 ml-1">
                    Provides server-side logic, API routes, secure actions, and routing.
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Supabase Edge Functions:</strong>
                  <span className="text-gray-600 ml-1">
                    Run serverless backend tasks close to the database for performance and controlled business logic.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Authentication */}
          <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100">
            <div className="flex items-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <Lock className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Authentication
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Supabase Auth:</strong>
                  <span className="text-gray-600 ml-1">
                    Manages user accounts, sessions, and triggers that sync data into the profiles table.
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Microsoft OAuth:</strong>
                  <span className="text-gray-600 ml-1">
                    Offers an additional sign-in option through the same auth system.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100">
            <div className="flex items-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                <Database className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Database
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Supabase Postgres:</strong>
                  <span className="text-gray-600 ml-1">
                    Central relational database storing businesses, employees, schedules, roles, requests, and messages.
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Row-Level Security (RLS):</strong>
                  <span className="text-gray-600 ml-1">
                    Ensures each business only accesses its own data.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Deployment */}
          <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100">
            <div className="flex items-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                <Globe className="h-6 w-6 text-gray-600" />
              </div>
              <h3 className="ml-3 text-xl font-semibold text-gray-900">
                Deployment
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <strong className="text-gray-900">Vercel:</strong>
                  <span className="text-gray-600 ml-1">
                    Hosts the entire Next.js app (frontend + backend).
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <span className="text-gray-600">
                    Provides automatic builds, scaling, and integration with Supabase environment variables.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Functionality Section */}
      <div className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Schedule-It Functionality
            </h2>
            <p className="text-lg text-gray-600">
              Comprehensive features for employers and employees
            </p>
          </div>

          {/* Employer Functionality */}
          <div className="mb-16">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center rounded-full bg-blue-100 px-4 py-2">
                <Briefcase className="h-5 w-5 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-800">
                  Employer Functionality
                </span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Business & Team Management */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Users className="h-6 w-6 text-blue-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Business & Team Management
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Create and manage businesses, roles, and locations
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Assign managers and adjust employee permissions
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Review, approve, or deny join requests
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Manage employment status (active, invited, terminated)
                  </li>
                </ul>
              </div>

              {/* Scheduling */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Calendar className="h-6 w-6 text-green-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Scheduling
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Create, edit, and publish shifts
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Assign employees to shifts or offer shifts for pickup
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    View employee availability and make scheduling decisions
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Monitor shift assignment statuses
                  </li>
                </ul>
              </div>

              {/* Availability & Time-Off Oversight */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Clock className="h-6 w-6 text-purple-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Availability & Time-Off Oversight
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    View employee availability patterns
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Review, approve, or deny time-off requests
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Modify availability entries if required
                  </li>
                </ul>
              </div>

              {/* Communication & Announcements */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <MessageSquare className="h-6 w-6 text-orange-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Communication & Announcements
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Post business-wide announcements with attachments
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Track which employees have read announcements
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Participate in direct messages and group chats
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Manage group membership and moderate conversations
                  </li>
                </ul>
              </div>

              {/* Verification & Documentation */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <FileText className="h-6 w-6 text-red-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Verification & Documentation
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Upload business verification documents
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Track verification status and review documents
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Complete domain verification via email or DNS
                  </li>
                </ul>
              </div>

              {/* Administrative Tools */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Settings className="h-6 w-6 text-gray-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Administrative Tools
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Update business settings (timezone, operating hours)
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Access restricted views powered by RLS
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Moderate users through blocking or removing roles
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Employee Functionality */}
          <div>
            <div className="mb-8 text-center">
              <div className="inline-flex items-center rounded-full bg-green-100 px-4 py-2">
                <UserCheck className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-800">
                  Employee Functionality
                </span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Onboarding */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <UserCheck className="h-6 w-6 text-blue-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Onboarding
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Join a business through a join request
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Set initial profile details and update information
                  </li>
                </ul>
              </div>

              {/* Scheduling Participation */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Calendar className="h-6 w-6 text-green-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Scheduling Participation
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    View published schedules and assigned shifts
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Accept, decline, or drop assigned shifts
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Request pickup for eligible open shifts
                  </li>
                </ul>
              </div>

              {/* Availability & Time-Off */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Clock className="h-6 w-6 text-purple-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Availability & Time-Off
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Submit weekly availability patterns
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Update availability when schedules change
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Request time off with detailed reasoning
                  </li>
                </ul>
              </div>

              {/* Communication */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <MessageSquare className="h-6 w-6 text-orange-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Communication
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Receive announcements from managers
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Participate in direct and group messaging
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Send and receive attachments
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Mute threads or block users if necessary
                  </li>
                </ul>
              </div>

              {/* Profile & Authentication */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <div className="flex items-center mb-4">
                  <Shield className="h-6 w-6 text-red-600 mr-3" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Profile & Authentication
                  </h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Log in using Supabase Auth or Microsoft OAuth
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                    Manage personal profile data and update photo, display name, and contact details
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 text-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-8">
            <Image
              src="/scheduleitlogo.png"
              alt="Schedule-It"
              width={60}
              height={60}
              className="mx-auto mb-4 drop-shadow-lg"
            />
            <h3 className="text-2xl font-bold mb-2">
              Schedule<span className="text-yellow-300">IT</span>
            </h3>
            <p className="text-gray-400">&quot;Schedule it your way&quot;</p>
          </div>
          <div className="border-t border-gray-800 pt-8">
            <p className="text-sm text-gray-400">
              Built by Diego Perez Benitez • Powered by modern web technologies
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

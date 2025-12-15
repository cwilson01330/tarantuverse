'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

interface AdminSection {
  title: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  items?: {
    label: string;
    href: string;
  }[];
}

const adminSections: AdminSection[] = [
  {
    title: 'Species Management',
    description: 'Manage species database, care sheets, and species data',
    icon: '🕷️',
    href: '/dashboard/admin/species/manage',
    color: 'from-purple-500 to-pink-500',
    items: [
      { label: 'Manage Species', href: '/dashboard/admin/species/manage' },
      { label: 'Add New Species', href: '/dashboard/admin/species/add' },
      { label: 'Bulk Import', href: '/dashboard/admin/species/bulk-import' },
    ],
  },
  {
    title: 'User Management',
    description: 'View and manage user accounts, roles, and permissions',
    icon: '👥',
    href: '/dashboard/admin/users',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    title: 'Promo Codes',
    description: 'Create and manage promotional codes for premium access',
    icon: '🎟️',
    href: '/dashboard/admin/promo-codes',
    color: 'from-green-500 to-emerald-500',
  },
  {
    title: 'Content Moderation',
    description: 'Review reports, manage blocks, and moderate user content',
    icon: '🛡️',
    href: '/dashboard/admin/moderation',
    color: 'from-red-500 to-orange-500',
    items: [
      { label: 'Pending Reports', href: '/dashboard/admin/moderation/reports' },
      { label: 'User Blocks', href: '/dashboard/admin/moderation/blocks' },
      { label: 'Forum Moderation', href: '/dashboard/admin/moderation/forums' },
    ],
  },
  {
    title: 'Analytics & Insights',
    description: 'Platform statistics, user metrics, and growth data',
    icon: '📊',
    href: '/dashboard/admin/analytics',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    title: 'System Settings',
    description: 'Configure platform settings and maintenance',
    icon: '⚙️',
    href: '/dashboard/admin/settings',
    color: 'from-gray-500 to-slate-500',
  },
];

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) return;

    // Check authentication
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    // Check if user is admin or superuser
    if (!user.is_admin && !user.is_superuser) {
      router.push('/dashboard');
      return;
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user || (!user.is_admin && !user.is_superuser)) {
    return null;
  }

  return (
    <DashboardLayout
      userName={user.name || user.username}
      userEmail={user.email || undefined}
      userAvatar={user.image || undefined}
    >
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Admin Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage and configure the Tarantuverse platform
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Admin Info Badge */}
          <div className="mt-4 inline-flex items-center gap-3">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
              <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
              {user.is_superuser ? 'Superuser' : 'Administrator'}
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {user.email || user.username}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Sections Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminSections.map((section) => (
            <div
              key={section.href}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 overflow-hidden group"
            >
              {/* Card Header with Gradient */}
              <div className={`bg-gradient-to-r ${section.color} p-6`}>
                <div className="text-5xl mb-3">{section.icon}</div>
                <h2 className="text-xl font-bold text-white">{section.title}</h2>
              </div>

              {/* Card Body */}
              <div className="p-6">
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {section.description}
                </p>

                {/* Sub-items or Main Link */}
                {section.items ? (
                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        → {item.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    href={section.href}
                    className="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    Open Dashboard
                    <svg
                      className="ml-2 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Stats Section (Optional - can be populated with real data) */}
        <div className="mt-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Quick Platform Stats
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                ---
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Users
              </div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">---</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Species
              </div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                ---
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Premium Users
              </div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">---</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Pending Reports
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
            Connect backend API endpoints to populate real-time stats
          </p>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-blue-600 dark:text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Admin Guidelines
              </h3>
              <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                <ul className="list-disc list-inside space-y-1">
                  <li>Review content reports within 24 hours per App Store guidelines</li>
                  <li>Verify all species data before approving community submissions</li>
                  <li>Monitor user activity for abuse patterns</li>
                  <li>Handle user data with GDPR compliance in mind</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

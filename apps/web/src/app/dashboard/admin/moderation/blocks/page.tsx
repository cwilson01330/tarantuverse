'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
  blocker?: {
    username: string;
    email: string;
  };
  blocked_user?: {
    username: string;
    email: string;
  };
}

interface User {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
  is_superuser: boolean;
  created_at: string;
}

export default function ModerationBlocksPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [userBlocks, setUserBlocks] = useState<UserBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    if (!user.is_admin && !user.is_superuser) {
      router.push('/dashboard');
      return;
    }

    fetchUsers();
  }, [isLoading, isAuthenticated, user, router]);

  const fetchUsers = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      setLoading(true);
      // Fetch all users
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBlocks = async (userId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      // Since we don't have an admin endpoint to get all blocks by user,
      // we'll show a message that this needs backend support
      // For now, we'll just show the user was selected
      setSelectedUser(userId);
      setUserBlocks([]);
    } catch (error) {
      console.error('Failed to fetch user blocks:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading user blocks...</p>
        </div>
      </div>
    );
  }

  if (!user || (!user.is_admin && !user.is_superuser)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                User Blocks Management
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                View and manage user blocking relationships
              </p>
            </div>
            <Link
              href="/dashboard/admin"
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              ← Back to Admin
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Users
            </h2>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search users by username or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              />
            </div>

            {/* Users List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => fetchUserBlocks(u.id)}
                  className={`w-full text-left p-4 rounded-lg border transition ${
                    selectedUser === u.id
                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {u.username}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {u.email}
                      </p>
                    </div>
                    {(u.is_admin || u.is_superuser) && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                        {u.is_superuser ? 'Superuser' : 'Admin'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Block Information */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Block Information
            </h2>

            {!selectedUser ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">👈</div>
                <p className="text-gray-500 dark:text-gray-400">
                  Select a user to view their blocking relationships
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-blue-600 dark:text-blue-400"
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
                        Backend Enhancement Needed
                      </h3>
                      <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                        <p>
                          To display user block relationships, we need to add an admin endpoint:
                        </p>
                        <code className="block mt-2 p-2 bg-blue-100 dark:bg-blue-900/40 rounded">
                          GET /api/v1/admin/users/{'{user_id}'}/blocks
                        </code>
                        <p className="mt-2">
                          This endpoint should return:
                        </p>
                        <ul className="list-disc list-inside mt-1">
                          <li>Users this user has blocked</li>
                          <li>Users who have blocked this user</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Currently, users can manage their own blocks from their settings page.
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Selected user ID: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{selectedUser}</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Platform Statistics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {users.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total Users
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {users.filter(u => u.is_admin || u.is_superuser).length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Admin Users
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                ---
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total Blocks (needs API)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

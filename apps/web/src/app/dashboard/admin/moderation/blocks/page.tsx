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
  const [userBlocks, setUserBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
    fetchBlockStats();
  }, [isLoading, isAuthenticated, user, router]);

  const fetchBlockStats = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/blocks/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTotalBlocks(data.total_blocks);
      }
    } catch (error) {
      console.error('Failed to fetch block stats:', error);
    }
  };

  const fetchUsers = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('No authentication token found');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Fetch all users
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('API Error:', response.status, errorData);
        setError(`Failed to load users: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBlocks = async (userId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      setSelectedUser(userId);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/blocks/admin/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        // Combine both blocks by user and blocks against user
        const allBlocks = [
          ...data.blocks_by_user.map((b: any) => ({
            ...b,
            type: 'blocked_by_user'
          })),
          ...data.blocks_against_user.map((b: any) => ({
            ...b,
            type: 'blocked_user'
          }))
        ];
        setUserBlocks(allBlocks);
      }
    } catch (error) {
      console.error('Failed to fetch user blocks:', error);
      setUserBlocks([]);
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
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-900 dark:text-red-200">Error Loading Data</h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => {
                      fetchUsers();
                      fetchBlockStats();
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
              <div className="space-y-4">
                {userBlocks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">✅</div>
                    <p className="text-gray-500 dark:text-gray-400">
                      No blocking relationships found for this user
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {userBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              block.type === 'blocked_by_user'
                                ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                : 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                            }`}>
                              {block.type === 'blocked_by_user' ? '🚫 User Blocked' : '⚠️ Blocked By'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(block.created_at)}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {block.type === 'blocked_by_user' && block.blocked_user && (
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Blocked User:</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {block.blocked_user.username} ({block.blocked_user.email})
                              </p>
                            </div>
                          )}

                          {block.type === 'blocked_user' && block.blocker && (
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Blocked By:</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {block.blocker.username} ({block.blocker.email})
                              </p>
                            </div>
                          )}

                          {block.reason && (
                            <div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Reason:</p>
                              <p className="text-sm text-gray-900 dark:text-white">{block.reason}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                {totalBlocks}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total Blocks
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

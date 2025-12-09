'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { format } from 'date-fns';

interface User {
    id: string;
    email: string;
    username: string;
    is_active: boolean;
    is_superuser: boolean;
    is_verified: boolean;
    created_at: string;
}

export default function ManageUsersPage() {
    const router = useRouter();
    const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [resetLoading, setResetLoading] = useState<string | null>(null);
    const [verifyLoading, setVerifyLoading] = useState<string | null>(null);
    const [grantLoading, setGrantLoading] = useState<string | null>(null);
    const [manualVerifyLoading, setManualVerifyLoading] = useState<string | null>(null);
    const [verifyAllLoading, setVerifyAllLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated || !token) {
            router.push('/login');
            return;
        }

        if (!authUser?.is_superuser) {
            router.push('/dashboard');
            return;
        }

        fetchUsers();
    }, [authLoading, isAuthenticated, token]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isAuthenticated && authUser?.is_superuser) {
                fetchUsers(searchQuery);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchUsers = async (search?: string) => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            let url = `${API_URL}/api/v1/admin/users?limit=1000`;
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
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

    const handleResetPassword = async (userId: string, email: string) => {
        if (!confirm(`Are you sure you want to send a password reset email to ${email}?`)) {
            return;
        }

        setResetLoading(userId);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert(`Password reset email sent to ${email}`);
            } else {
                alert('Failed to send reset email');
            }
        } catch (error) {
            console.error('Error sending reset email:', error);
            alert('Error sending reset email');
        } finally {
            setResetLoading(null);
        }
    };

    const handleResendVerification = async (userId: string, email: string) => {
        if (!confirm(`Are you sure you want to resend verification email to ${email}?`)) {
            return;
        }

        setVerifyLoading(userId);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/admin/users/${userId}/resend-verification`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert(`Verification email sent to ${email}`);
            } else {
                const data = await response.json();
                alert(data.detail || 'Failed to send verification email');
            }
        } catch (error) {
            console.error('Error sending verification email:', error);
            alert('Error sending verification email');
        } finally {
            setVerifyLoading(null);
        }
    };

    const handleGrantPremium = async (userId: string, username: string) => {
        if (!confirm(`Grant LIFETIME premium access to ${username}? This action grants permanent premium features.`)) {
            return;
        }

        setGrantLoading(userId);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/promo-codes/admin/grant/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert(`✅ Successfully granted lifetime premium to ${username}!`);
            } else {
                const error = await response.json();
                alert(`Failed to grant premium: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error granting premium:', error);
            alert('Error granting premium access');
        } finally {
            setGrantLoading(null);
        }
    };

    const handleManualVerify = async (userId: string, email: string) => {
        if (!confirm(`Manually verify ${email}? This will bypass email verification.`)) {
            return;
        }

        setManualVerifyLoading(userId);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/admin/users/${userId}/verify`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert(`✅ Successfully verified ${email}!`);
                // Refresh users list
                fetchUsers(searchQuery);
            } else {
                const error = await response.json();
                alert(`Failed to verify: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error verifying user:', error);
            alert('Error verifying user');
        } finally {
            setManualVerifyLoading(null);
        }
    };

    const handleVerifyAll = async () => {
        const unverifiedCount = users.filter(u => !u.is_verified).length;

        if (unverifiedCount === 0) {
            alert('All users are already verified!');
            return;
        }

        if (!confirm(`Verify ALL ${unverifiedCount} unverified users? This will bypass email verification for all of them.`)) {
            return;
        }

        setVerifyAllLoading(true);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/admin/users/verify-all`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                alert(`✅ ${data.message}`);
                // Refresh users list
                fetchUsers(searchQuery);
            } else {
                const error = await response.json();
                alert(`Failed to verify all: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error verifying all users:', error);
            alert('Error verifying all users');
        } finally {
            setVerifyAllLoading(false);
        }
    };

    if (loading || authLoading) {
        return (
            <DashboardLayout
                userName={authUser?.name ?? undefined}
                userEmail={authUser?.email ?? undefined}
                userAvatar={authUser?.image ?? undefined}
            >
                <div className="flex items-center justify-center py-12">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            userName={authUser?.name ?? undefined}
            userEmail={authUser?.email ?? undefined}
            userAvatar={authUser?.image ?? undefined}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        👥 Manage Users
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        View users and manage account security
                    </p>
                </div>

                {/* User Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                                    {users.length}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">👥</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Verified</p>
                                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                                    {users.filter(u => u.is_verified).length}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">✓</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            {users.length > 0 ? Math.round((users.filter(u => u.is_verified).length / users.length) * 100) : 0}% of total
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Unverified</p>
                                <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">
                                    {users.filter(u => !u.is_verified).length}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">⚠</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            {users.length > 0 ? Math.round((users.filter(u => !u.is_verified).length / users.length) * 100) : 0}% of total
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Superadmins</p>
                                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                                    {users.filter(u => u.is_superuser).length}
                                </p>
                            </div>
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                                <span className="text-2xl">👑</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Admin accounts
                        </p>
                    </div>
                </div>

                <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <input
                        type="text"
                        placeholder="Search users by email, username, or name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full sm:w-96 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    {users.filter(u => !u.is_verified).length > 0 && (
                        <button
                            onClick={handleVerifyAll}
                            disabled={verifyAllLoading}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-50 whitespace-nowrap"
                        >
                            {verifyAllLoading ? 'Verifying...' : `✓ Verify All (${users.filter(u => !u.is_verified).length})`}
                        </button>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        User
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Verified
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Role
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Joined
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-900 dark:text-white">
                                                    {user.username}
                                                </span>
                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                    {user.email}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.is_active
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                }`}>
                                                {user.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.is_verified
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                }`}>
                                                {user.is_verified ? '✓ Verified' : '⚠ Unverified'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.is_superuser
                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                                }`}>
                                                {user.is_superuser ? 'Superadmin' : 'User'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {format(new Date(user.created_at), 'MMM d, yyyy')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                                {!user.is_verified && (
                                                    <>
                                                        <button
                                                            onClick={() => handleManualVerify(user.id, user.email)}
                                                            disabled={manualVerifyLoading === user.id}
                                                            className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium disabled:opacity-50"
                                                        >
                                                            {manualVerifyLoading === user.id ? 'Verifying...' : '✓ Manual Verify'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleResendVerification(user.id, user.email)}
                                                            disabled={verifyLoading === user.id}
                                                            className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium disabled:opacity-50"
                                                        >
                                                            {verifyLoading === user.id ? 'Sending...' : 'Resend Verification'}
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => handleResetPassword(user.id, user.email)}
                                                    disabled={resetLoading === user.id}
                                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50"
                                                >
                                                    {resetLoading === user.id ? 'Sending...' : 'Send Reset Email'}
                                                </button>
                                                <button
                                                    onClick={() => handleGrantPremium(user.id, user.username)}
                                                    disabled={grantLoading === user.id}
                                                    className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-sm font-medium disabled:opacity-50"
                                                >
                                                    {grantLoading === user.id ? 'Granting...' : '💎 Grant Premium'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

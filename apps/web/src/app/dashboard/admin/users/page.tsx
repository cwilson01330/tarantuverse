'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { format } from 'date-fns';
// Lucide icons replace inline emoji glyphs for these pills + buttons.
// Color emojis like ✓ / 💎 / ❌ / 🗑️ render at a larger metric box than
// surrounding text on most browsers, so they visually escape pill bounds
// (especially with rounded-full + tight padding) and read as "broken
// badge stuck on the pill" rather than as a coherent pill. SVG icons
// respect text-baseline and font-size cleanly.
import {
    Check,
    AlertTriangle,
    Gem,
    X,
    Trash2,
    MoreVertical,
    Mail,
    KeyRound,
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    username: string;
    is_active: boolean;
    is_superuser: boolean;
    is_verified: boolean;
    is_premium?: boolean;
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
    const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
    const [manualVerifyLoading, setManualVerifyLoading] = useState<string | null>(null);
    const [verifyAllLoading, setVerifyAllLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Per-row action menu — collapses the 4–6 action buttons that used to
    // overflow horizontally into a single ⋮ trigger that opens a fixed-
    // positioned dropdown next to the button. Tracking the bounding rect
    // (instead of using absolute positioning inside the cell) avoids the
    // table's `overflow-hidden` clipping the menu.
    const [openMenu, setOpenMenu] = useState<{
        userId: string;
        // Anchor point so the menu can render right-aligned with the
        // trigger button in fixed coordinates.
        x: number;
        y: number;
    } | null>(null);

    // Close the action menu on outside click or Escape, and on scroll
    // (otherwise the menu floats away from its row when the page scrolls,
    // which is more confusing than just closing it).
    useEffect(() => {
        if (!openMenu) return;
        function close() {
            setOpenMenu(null);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') close();
        }
        document.addEventListener('mousedown', close);
        document.addEventListener('scroll', close, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('scroll', close, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [openMenu]);

    function handleOpenMenu(
        userId: string,
        e: React.MouseEvent<HTMLButtonElement>,
    ) {
        // Stop propagation so the document mousedown listener (which would
        // immediately close it) doesn't fire on the same click.
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        // Menu width is ~14rem (w-56). Right-align with the button.
        const MENU_WIDTH = 224;
        const x = Math.max(8, rect.right - MENU_WIDTH);
        const y = rect.bottom + 4;
        setOpenMenu((prev) =>
            prev?.userId === userId ? null : { userId, x, y },
        );
    }

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
                fetchUsers(searchQuery); // Refresh to show updated status
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

    const handleRevokePremium = async (userId: string, username: string) => {
        if (!confirm(`Revoke premium access from ${username}? They will lose all premium features.`)) {
            return;
        }

        setRevokeLoading(userId);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/promo-codes/admin/revoke/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert(`✅ Successfully revoked premium from ${username}`);
                fetchUsers(searchQuery); // Refresh to show updated status
            } else {
                const error = await response.json();
                alert(`Failed to revoke premium: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error revoking premium:', error);
            alert('Error revoking premium access');
        } finally {
            setRevokeLoading(null);
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

    const handleDeleteUser = async (userId: string, username: string, email: string) => {
        // Double confirmation for destructive action
        if (!confirm(`⚠️ DELETE USER: ${username} (${email})\n\nThis will permanently delete:\n• All their tarantulas\n• All feeding/molt/substrate logs\n• All photos\n• All breeding data\n• All messages and posts\n\nThis action CANNOT be undone!\n\nAre you sure?`)) {
            return;
        }

        // Second confirmation
        if (!confirm(`FINAL WARNING: Type 'DELETE' mentally and click OK to permanently delete ${username}'s account and ALL their data.`)) {
            return;
        }

        setDeleteLoading(userId);
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                alert(`✅ Successfully deleted user ${username} (${email})`);
                // Remove from local state
                setUsers(users.filter(u => u.id !== userId));
            } else {
                const error = await response.json();
                alert(`Failed to delete user: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Error deleting user');
        } finally {
            setDeleteLoading(null);
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
                            className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-50 whitespace-nowrap"
                        >
                            {verifyAllLoading ? (
                                'Verifying...'
                            ) : (
                                <><Check className="w-4 h-4" aria-hidden="true" /> Verify All ({users.filter(u => !u.is_verified).length})</>
                            )}
                        </button>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        {/* Actions are now consolidated into a per-row ⋮
                            dropdown so the table doesn't need horizontal
                            scrolling at typical desktop widths. The wrapper
                            keeps overflow-x-auto as a defensive fallback
                            for narrow tablets. */}
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
                                        Premium
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Joined
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
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
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full leading-none ${user.is_verified
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                }`}>
                                                {user.is_verified ? (
                                                    <><Check className="w-3 h-3" aria-hidden="true" /> Verified</>
                                                ) : (
                                                    <><AlertTriangle className="w-3 h-3" aria-hidden="true" /> Unverified</>
                                                )}
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
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full leading-none ${user.is_premium
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                {user.is_premium ? (
                                                    <><Gem className="w-3 h-3" aria-hidden="true" /> Premium</>
                                                ) : (
                                                    <>Free</>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {format(new Date(user.created_at), 'MMM d, yyyy')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {/* Compact per-row action trigger — full menu opens
                                                via the ⋮ button. A row that has any in-flight
                                                action (verify/grant/etc.) shows the row-level
                                                spinner via the busy state on the trigger so
                                                the keeper still gets feedback while the menu
                                                is closed. */}
                                            <button
                                                type="button"
                                                onClick={(e) => handleOpenMenu(user.id, e)}
                                                aria-haspopup="menu"
                                                aria-expanded={openMenu?.userId === user.id}
                                                aria-label={`Actions for ${user.username}`}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50"
                                                disabled={
                                                    resetLoading === user.id ||
                                                    verifyLoading === user.id ||
                                                    manualVerifyLoading === user.id ||
                                                    grantLoading === user.id ||
                                                    revokeLoading === user.id ||
                                                    deleteLoading === user.id
                                                }
                                            >
                                                <MoreVertical className="w-5 h-5" aria-hidden="true" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Per-row action menu — rendered as a fixed-positioned popover
                outside the table so it isn't clipped by the table's
                rounded-overflow wrapper. The trigger button computes the
                anchor coordinates on click; closing happens via the
                document-level mousedown/scroll/Escape listeners wired up
                in the useEffect above.

                stopPropagation on the inner div keeps a click inside the
                menu from immediately closing it. Each menu item closes the
                menu before invoking its handler so the popover doesn't
                linger over a row that's about to mutate. */}
            {openMenu &&
                (() => {
                    const u = users.find((x) => x.id === openMenu.userId);
                    if (!u) return null;
                    const close = () => setOpenMenu(null);
                    return (
                        <div
                            role="menu"
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                                position: 'fixed',
                                left: openMenu.x,
                                top: openMenu.y,
                                width: 224,
                                zIndex: 50,
                            }}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 text-sm"
                        >
                            {!u.is_verified && (
                                <>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            close();
                                            handleManualVerify(u.id, u.email);
                                        }}
                                        disabled={manualVerifyLoading === u.id}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        <Check className="w-4 h-4" aria-hidden="true" />
                                        {manualVerifyLoading === u.id ? 'Verifying…' : 'Manual Verify'}
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            close();
                                            handleResendVerification(u.id, u.email);
                                        }}
                                        disabled={verifyLoading === u.id}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        <Mail className="w-4 h-4" aria-hidden="true" />
                                        {verifyLoading === u.id ? 'Sending…' : 'Resend Verification'}
                                    </button>
                                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                                </>
                            )}

                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    close();
                                    handleResetPassword(u.id, u.email);
                                }}
                                disabled={resetLoading === u.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                                <KeyRound className="w-4 h-4" aria-hidden="true" />
                                {resetLoading === u.id ? 'Sending…' : 'Send Password Reset'}
                            </button>

                            {u.is_premium ? (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        close();
                                        handleRevokePremium(u.id, u.username);
                                    }}
                                    disabled={revokeLoading === u.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                    <X className="w-4 h-4" aria-hidden="true" />
                                    {revokeLoading === u.id ? 'Revoking…' : 'Revoke Premium'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        close();
                                        handleGrantPremium(u.id, u.username);
                                    }}
                                    disabled={grantLoading === u.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                    <Gem className="w-4 h-4" aria-hidden="true" />
                                    {grantLoading === u.id ? 'Granting…' : 'Grant Premium'}
                                </button>
                            )}

                            {/* Don't allow deleting yourself */}
                            {u.id !== authUser?.id && (
                                <>
                                    <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            close();
                                            handleDeleteUser(u.id, u.username, u.email);
                                        }}
                                        disabled={deleteLoading === u.id}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                                        {deleteLoading === u.id ? 'Deleting…' : 'Delete User'}
                                    </button>
                                </>
                            )}
                        </div>
                    );
                })()}
        </DashboardLayout>
    );
}

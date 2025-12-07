'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { format } from 'date-fns';

interface PromoCode {
    id: string;
    code: string;
    code_type: string;
    usage_limit: number | null;
    times_used: number;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    created_by_admin_id: string;
}

interface BulkCreateForm {
    code_type: string;
    count: number;
    prefix: string;
    usage_limit: number | null;
    expires_at: string;
}

export default function ManagePromoCodesPage() {
    const router = useRouter();
    const { user: authUser, token, isAuthenticated, isLoading: authLoading } = useAuth();
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showBulkCreate, setShowBulkCreate] = useState(false);
    const [bulkForm, setBulkForm] = useState<BulkCreateForm>({
        code_type: 'lifetime',
        count: 10,
        prefix: 'EARLY',
        usage_limit: 1,
        expires_at: '',
    });
    const [creatingBulk, setCreatingBulk] = useState(false);

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

        fetchPromoCodes();
    }, [authLoading, isAuthenticated, token]);

    const fetchPromoCodes = async () => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/promo-codes/`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                setPromoCodes(data);
            }
        } catch (error) {
            console.error('Failed to fetch promo codes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreatingBulk(true);

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const payload = {
                code_type: bulkForm.code_type,
                count: bulkForm.count,
                prefix: bulkForm.prefix,
                usage_limit: bulkForm.usage_limit,
                expires_at: bulkForm.expires_at || null,
            };

            const response = await fetch(`${API_URL}/api/v1/promo-codes/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                alert(`Successfully created ${bulkForm.count} promo codes!`);
                setShowBulkCreate(false);
                setBulkForm({
                    code_type: 'lifetime',
                    count: 10,
                    prefix: 'EARLY',
                    usage_limit: 1,
                    expires_at: '',
                });
                fetchPromoCodes();
            } else {
                const error = await response.json();
                alert(`Failed to create codes: ${error.detail}`);
            }
        } catch (error) {
            console.error('Error creating bulk codes:', error);
            alert('Error creating promo codes');
        } finally {
            setCreatingBulk(false);
        }
    };

    const handleToggleActive = async (codeId: string, currentStatus: boolean) => {
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/promo-codes/${codeId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ is_active: !currentStatus }),
            });

            if (response.ok) {
                fetchPromoCodes();
            } else {
                alert('Failed to update promo code');
            }
        } catch (error) {
            console.error('Error updating promo code:', error);
            alert('Error updating promo code');
        }
    };

    const handleDelete = async (codeId: string, code: string) => {
        if (!confirm(`Are you sure you want to delete promo code "${code}"?`)) {
            return;
        }

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/promo-codes/${codeId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (response.ok) {
                fetchPromoCodes();
            } else {
                alert('Failed to delete promo code');
            }
        } catch (error) {
            console.error('Error deleting promo code:', error);
            alert('Error deleting promo code');
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
                        🎟️ Manage Promo Codes
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Generate and manage promotional codes for premium access
                    </p>
                </div>

                {/* Bulk Create Button */}
                <div className="mb-6">
                    <button
                        onClick={() => setShowBulkCreate(!showBulkCreate)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition font-semibold"
                    >
                        {showBulkCreate ? 'Cancel' : 'Generate Bulk Codes'}
                    </button>
                </div>

                {/* Bulk Create Form */}
                {showBulkCreate && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border-2 border-purple-200 dark:border-purple-700">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Bulk Generate Promo Codes
                        </h2>
                        <form onSubmit={handleBulkCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                    Code Type
                                </label>
                                <select
                                    value={bulkForm.code_type}
                                    onChange={(e) => setBulkForm({ ...bulkForm, code_type: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                >
                                    <option value="lifetime">Lifetime</option>
                                    <option value="one_year">One Year</option>
                                    <option value="six_month">Six Months</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                    Number of Codes
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={bulkForm.count}
                                    onChange={(e) => setBulkForm({ ...bulkForm, count: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                    Prefix (Optional)
                                </label>
                                <input
                                    type="text"
                                    maxLength={10}
                                    value={bulkForm.prefix}
                                    onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value.toUpperCase() })}
                                    placeholder="EARLY, BETA, etc."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                    Usage Limit (blank = unlimited)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={bulkForm.usage_limit ?? ''}
                                    onChange={(e) => setBulkForm({ ...bulkForm, usage_limit: e.target.value ? parseInt(e.target.value) : null })}
                                    placeholder="1 for single-use"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                    Expiration Date (Optional)
                                </label>
                                <input
                                    type="date"
                                    value={bulkForm.expires_at}
                                    onChange={(e) => setBulkForm({ ...bulkForm, expires_at: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <button
                                    type="submit"
                                    disabled={creatingBulk}
                                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition font-semibold disabled:opacity-50"
                                >
                                    {creatingBulk ? 'Generating...' : `Generate ${bulkForm.count} Codes`}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Promo Codes Table */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Code
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Usage
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Expires
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {promoCodes.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                            No promo codes yet. Generate some using the button above!
                                        </td>
                                    </tr>
                                ) : (
                                    promoCodes.map((code) => (
                                        <tr key={code.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4">
                                                <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                                                    {code.code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                                    {code.code_type.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                                {code.times_used} / {code.usage_limit ?? '∞'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                    code.is_active
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                }`}>
                                                    {code.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                {code.expires_at ? format(new Date(code.expires_at), 'MMM d, yyyy') : 'Never'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                {format(new Date(code.created_at), 'MMM d, yyyy')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => handleToggleActive(code.id, code.is_active)}
                                                        className={`text-sm font-medium ${
                                                            code.is_active
                                                                ? 'text-red-600 hover:text-red-800 dark:text-red-400'
                                                                : 'text-green-600 hover:text-green-800 dark:text-green-400'
                                                        }`}
                                                    >
                                                        {code.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(code.id, code.code)}
                                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Stats Summary */}
                {promoCodes.length > 0 && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                                {promoCodes.length}
                            </div>
                            <div className="text-sm text-purple-700 dark:text-purple-300">Total Codes</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                                {promoCodes.filter(c => c.is_active).length}
                            </div>
                            <div className="text-sm text-green-700 dark:text-green-300">Active Codes</div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                                {promoCodes.reduce((sum, c) => sum + c.times_used, 0)}
                            </div>
                            <div className="text-sm text-blue-700 dark:text-blue-300">Total Redemptions</div>
                        </div>
                        <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4">
                            <div className="text-2xl font-bold text-pink-900 dark:text-pink-100">
                                {promoCodes.filter(c => c.code_type === 'lifetime').length}
                            </div>
                            <div className="text-sm text-pink-700 dark:text-pink-300">Lifetime Codes</div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

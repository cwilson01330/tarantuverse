'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Subscription {
  id: string;
  username: string;
  email: string | null;
  plan: string | null;
  plan_display_name?: string | null;
  app?: string | null; // tarantuverse | herpetoverse | both
  status: string;
  is_active: boolean;
  payment_provider: string | null;
  subscription_source: string | null;
  payment_provider_id: string | null;
  auto_renew: boolean;
  granted_by_admin: boolean;
  promo_code_used: string | null;
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

const PROVIDER_STYLE: Record<string, string> = {
  apple: 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
  stripe: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  admin_grant: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(); } catch { return s; }
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, token } = useAuth();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) { router.push('/login'); return; }
    if (!user.is_admin && !user.is_superuser) { router.push('/dashboard'); return; }
  }, [isLoading, isAuthenticated, user, router]);

  // Depend only on stable primitives (token, activeOnly). Depending on the
  // useAuth `user` object — which gets a fresh identity every render — caused an
  // infinite refetch loop (the "Loading…" flash). cancelled-guard avoids setting
  // state after unmount / rapid toggle.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/subscriptions?active_only=${activeOnly}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.ok) setSubs(await res.json());
      } catch (e) {
        if (!cancelled) console.error('Failed to load subscriptions', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, activeOnly]);

  if (isLoading || !user || (!user.is_admin && !user.is_superuser)) return null;

  const paying = subs.filter((s) => s.payment_provider === 'apple' || s.payment_provider === 'stripe');

  return (
    <DashboardLayout userName={user.name || user.username} userEmail={user.email || undefined} userAvatar={user.image || undefined}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Subscriptions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Apple, Stripe, and admin-granted premium — with provider, plan, renewal, and transaction ID.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="rounded" />
            Active paid only
          </label>
        </div>

        {/* Quick counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Showing', value: subs.length, color: 'text-purple-600 dark:text-purple-400' },
            { label: 'Paying (Apple+Stripe)', value: paying.length, color: 'text-green-600 dark:text-green-400' },
            { label: 'Apple', value: subs.filter((s) => s.payment_provider === 'apple').length, color: 'text-gray-700 dark:text-gray-200' },
            { label: 'Stripe', value: subs.filter((s) => s.payment_provider === 'stripe').length, color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Tarantuverse', value: subs.filter((s) => s.app === 'tarantuverse').length, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Herpetoverse', value: subs.filter((s) => s.app === 'herpetoverse').length, color: 'text-green-600 dark:text-green-400' },
            { label: 'All-Access', value: subs.filter((s) => s.app === 'both').length, color: 'text-purple-600 dark:text-purple-400' },
          ].map((c) => (
            <div key={c.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${c.color}`}>{loading ? '…' : c.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">App</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Renews / Expires</th>
                <th className="px-4 py-3">Auto-renew</th>
                <th className="px-4 py-3">Transaction ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">Loading…</td></tr>
              ) : subs.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No subscriptions found.</td></tr>
              ) : subs.map((s) => (
                <tr key={s.id} className="text-gray-900 dark:text-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.username}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{s.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PROVIDER_STYLE[s.payment_provider || ''] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                      {s.payment_provider === 'admin_grant' ? 'admin grant' : (s.payment_provider || '—')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.app ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.app === 'both'
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : s.app === 'herpetoverse'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        {s.app === 'both' ? 'All-Access' : s.app === 'herpetoverse' ? 'Herpetoverse' : 'Tarantuverse'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 capitalize">{s.plan || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}`}>
                      {s.is_active ? 'active' : s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(s.started_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{s.expires_at ? fmtDate(s.expires_at) : 'lifetime'}</td>
                  <td className="px-4 py-3">{s.auto_renew ? 'yes' : 'no'}</td>
                  <td className="px-4 py-3 text-xs font-mono break-all text-gray-600 dark:text-gray-400">{s.payment_provider_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Apple Sign-in subscribers use a private-relay email and a random username by design — the transaction ID is the reliable handle.
        </p>
      </div>
    </DashboardLayout>
  );
}

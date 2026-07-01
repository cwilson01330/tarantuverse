'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface LinkedAccount {
  id: string;
  provider: string;
  provider_email: string | null;
  provider_name: string | null;
  provider_avatar: string | null;
  created_at: string | null;
}

type KnownProvider = 'google' | 'apple';

const KNOWN_PROVIDERS: { id: KnownProvider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
];

function providerLabel(provider: string): string {
  const known = KNOWN_PROVIDERS.find((p) => p.id === provider);
  if (known) return known.label;
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case 'google':
      return (
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      );
    case 'apple':
      return (
        <svg className="w-5 h-5 shrink-0 text-theme-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      );
    default:
      return <span className="w-5 h-5 shrink-0 rounded-full bg-gray-400" aria-hidden="true"></span>;
  }
}

export default function LinkedAccounts() {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>('');

  const fetchLinkedAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/auth/linked-accounts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load sign-in methods');
      }

      const data: LinkedAccount[] = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching linked accounts:', error);
      setLoadError('Failed to load your sign-in methods. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !token) return;
    fetchLinkedAccounts();
  }, [authLoading, isAuthenticated, token, fetchLinkedAccounts]);

  const handleUnlink = async (provider: string) => {
    const label = providerLabel(provider);
    if (
      !confirm(
        `Remove ${label} as a sign-in method? You will no longer be able to sign in with ${label} unless you add it again.`
      )
    ) {
      return;
    }

    setUnlinkingProvider(provider);
    setActionError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/auth/unlink-account/${provider}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchLinkedAccounts();
      } else {
        let detail = 'Failed to remove sign-in method.';
        try {
          const data = await response.json();
          if (data?.detail) detail = data.detail;
        } catch {
          // response had no JSON body; keep default message
        }
        setActionError(detail);
      }
    } catch (error) {
      console.error('Error unlinking account:', error);
      setActionError('Failed to remove sign-in method. Please try again.');
    } finally {
      setUnlinkingProvider(null);
    }
  };

  // Show a row for every known provider plus any linked provider not in the known list.
  const linkedProviders = new Set(accounts.map((a) => a.provider));
  const extraLinked = accounts
    .map((a) => a.provider)
    .filter((p) => !KNOWN_PROVIDERS.some((k) => k.id === p));
  const displayProviders: string[] = [
    ...KNOWN_PROVIDERS.map((p) => p.id),
    ...Array.from(new Set(extraLinked)),
  ];

  return (
    <section className="bg-surface rounded-xl border border-theme p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🔗</span>
        <h2 className="text-xl font-bold text-theme-primary">Sign-in methods</h2>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="p-4 bg-surface-elevated rounded-lg text-center">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-theme-secondary mt-2">Loading sign-in methods...</p>
          </div>
        ) : loadError ? (
          <div className="p-4 bg-surface-elevated rounded-lg text-center">
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{loadError}</p>
            <button
              onClick={fetchLinkedAccounts}
              className="px-4 py-2 bg-gradient-brand hover:bg-gradient-brand-hover text-white rounded-lg transition-all font-medium text-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {actionError && (
              <div
                role="alert"
                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <p className="text-sm text-red-800 dark:text-red-300">{actionError}</p>
              </div>
            )}

            <div className="space-y-3">
              {displayProviders.map((provider) => {
                const linked = accounts.find((a) => a.provider === provider);
                const isLinked = !!linked;
                const label = providerLabel(provider);
                const isBusy = unlinkingProvider === provider;

                return (
                  <div
                    key={provider}
                    className="flex items-center justify-between gap-3 p-4 bg-surface-elevated rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProviderIcon provider={provider} />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-theme-primary">{label}</h3>
                        <p className="text-sm text-theme-secondary truncate">
                          {isLinked ? linked?.provider_email || 'Linked' : 'Not linked'}
                        </p>
                      </div>
                    </div>

                    {isLinked ? (
                      <button
                        onClick={() => handleUnlink(provider)}
                        disabled={isBusy}
                        aria-label={`Remove ${label} as a sign-in method`}
                        className="shrink-0 px-3 py-1.5 text-sm rounded-lg transition bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBusy ? 'Removing...' : 'Remove'}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-theme-tertiary">Not linked</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-theme-secondary pt-2">
              To add another sign-in method, use the Tarantuverse mobile app. On the web you can
              view and remove your existing sign-in methods here.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

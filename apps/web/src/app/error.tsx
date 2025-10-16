'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-theme flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-8xl mb-6">⚠️</div>
        <h1 className="text-6xl font-bold text-theme-primary mb-4">Error</h1>
        <h2 className="text-2xl font-semibold text-theme-secondary mb-6">
          Something went wrong
        </h2>
        <p className="text-theme-tertiary mb-8 max-w-md mx-auto">
          An unexpected error occurred while processing your request.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-gradient-brand text-white rounded-lg hover:shadow-lg hover:shadow-gradient-brand transition-all font-semibold"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-3 bg-surface border border-theme text-theme-primary rounded-lg hover:bg-surface-elevated transition-all font-semibold"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

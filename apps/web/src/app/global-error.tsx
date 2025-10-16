'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-8xl mb-6">💥</div>
            <h1 className="text-6xl font-bold text-white mb-4">500</h1>
            <h2 className="text-2xl font-semibold text-gray-300 mb-6">
              Critical Error
            </h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              A critical error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={reset}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

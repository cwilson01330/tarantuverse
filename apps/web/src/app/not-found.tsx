'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-theme flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-8xl mb-6">🕷️</div>
        <h1 className="text-6xl font-bold text-theme-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-theme-secondary mb-6">
          Page Not Found
        </h2>
        <p className="text-theme-tertiary mb-8 max-w-md mx-auto">
          The page you're looking for has scuttled away into the shadows.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-gradient-brand text-white rounded-lg hover:shadow-lg hover:shadow-gradient-brand transition-all font-semibold"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

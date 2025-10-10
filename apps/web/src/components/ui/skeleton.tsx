import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full' | 'none';
}

export function Skeleton({ 
  className = '', 
  width, 
  height = 'h-4',
  rounded = 'md' 
}: SkeletonProps) {
  const roundedClass = {
    'none': 'rounded-none',
    'sm': 'rounded-sm',
    'md': 'rounded-md',
    'lg': 'rounded-lg',
    'full': 'rounded-full'
  }[rounded];

  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 ${height} ${roundedClass} ${width || 'w-full'} ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
      <Skeleton height="h-48" rounded="none" />
      <div className="p-4 space-y-3">
        <Skeleton width="w-3/4" height="h-6" />
        <Skeleton width="w-full" height="h-4" />
        <Skeleton width="w-1/2" height="h-4" />
        <div className="flex gap-2 pt-2">
          <Skeleton width="w-16" height="h-6" rounded="full" />
          <Skeleton width="w-20" height="h-6" rounded="full" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Skeleton width="w-24 h-24" rounded="lg" />
          <div className="flex-1 space-y-2">
            <Skeleton width="w-1/3" height="h-5" />
            <Skeleton width="w-1/2" height="h-4" />
            <Skeleton width="w-full" height="h-4" />
            <div className="flex gap-2 pt-2">
              <Skeleton width="w-16" height="h-5" rounded="full" />
              <Skeleton width="w-16" height="h-5" rounded="full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <Skeleton width="w-1/4" height="h-10" />
          <Skeleton width="w-1/4" height="h-10" />
          <Skeleton width="w-1/4" height="h-10" />
          <Skeleton width="w-1/4" height="h-10" />
        </div>
      ))}
    </div>
  );
}

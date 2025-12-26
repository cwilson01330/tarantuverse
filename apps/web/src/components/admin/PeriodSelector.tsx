'use client';

import React from 'react';
import { AnalyticsPeriod } from '@/types/admin-analytics';

interface PeriodSelectorProps {
  value: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
}

const periods: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
];

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            value === period.value
              ? 'bg-purple-600 text-white'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

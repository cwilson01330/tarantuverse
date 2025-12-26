'use client';

import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PieDataItem = { name: string; value: number; percentage?: number } & Record<string, any>;

interface AdminPieChartProps {
  data: PieDataItem[];
  title?: string;
  colors?: string[];
  height?: number;
  showLegend?: boolean;
}

const DEFAULT_COLORS = [
  '#8B5CF6', // Purple
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#14B8A6', // Teal
];

export default function AdminPieChart({
  data,
  title,
  colors = DEFAULT_COLORS,
  height = 300,
  showLegend = true,
}: AdminPieChartProps) {
  interface TooltipPayloadItem {
    name: string;
    value: number;
    payload: PieDataItem;
  }

  interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
  }

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {entry.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Count: <span className="font-medium text-gray-900 dark:text-white">{entry.value.toLocaleString()}</span>
          </p>
          {entry.payload.percentage !== undefined && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Share: <span className="font-medium text-gray-900 dark:text-white">{entry.payload.percentage.toFixed(1)}%</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  interface LegendPayloadItem {
    value: string;
    color?: string;
  }

  interface CustomLegendProps {
    payload?: LegendPayloadItem[];
  }

  const CustomLegend = ({ payload }: CustomLegendProps) => {
    if (!payload) return null;
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        {title && (
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {title}
          </h3>
        )}
        <div className="flex items-center justify-center h-[200px] text-gray-500 dark:text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={colors[index % colors.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          {showLegend && <Legend content={<CustomLegend />} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

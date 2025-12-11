'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface ContentReport {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  report_type: string;
  content_id: string;
  content_url: string | null;
  reason: string;
  description: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  reviewed_by: string | null;
  reviewed_at: string | null;
  moderation_notes: string | null;
  action_taken: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function ModerationReportsPage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selectedReport, setSelectedReport] = useState<ContentReport | null>(null);
  const [moderationNotes, setModerationNotes] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    if (!user.is_admin && !user.is_superuser) {
      router.push('/dashboard');
      return;
    }

    fetchReports();
  }, [isLoading, isAuthenticated, user, router, filter]);

  const fetchReports = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('No authentication token found');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const endpoint = filter === 'pending'
        ? '/api/v1/reports/admin/pending'
        : '/api/v1/reports/admin/all';

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('API Error:', response.status, errorData);
        setError(`Failed to load reports: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      setError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewReport = async (reportId: string, newStatus: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/reports/${reportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          moderation_notes: moderationNotes,
          action_taken: actionTaken,
        }),
      });

      if (response.ok) {
        setSelectedReport(null);
        setModerationNotes('');
        setActionTaken('');
        fetchReports();
      }
    } catch (error) {
      console.error('Failed to review report:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
      reviewed: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
      dismissed: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
      action_taken: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const getReportTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      user: '👤',
      forum_post: '💬',
      forum_reply: '↩️',
      direct_message: '✉️',
      collection: '🕷️',
      other: '⚠️',
    };
    return icons[type] || '⚠️';
  };

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading reports...</p>
        </div>
      </div>
    );
  }

  if (!user || (!user.is_admin && !user.is_superuser)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Content Reports
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Review and moderate reported content
              </p>
            </div>
            <Link
              href="/dashboard/admin"
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              ← Back to Admin
            </Link>
          </div>

          {/* Filter Tabs */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === 'pending'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Pending ({reports.filter(r => r.status === 'pending').length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All Reports ({reports.length})
            </button>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-900 dark:text-red-200">Error Loading Reports</h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => fetchReports()}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!error && reports.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Reports to Review
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {filter === 'pending'
                ? 'All reports have been reviewed!'
                : 'No reports have been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{getReportTypeIcon(report.report_type)}</div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {report.report_type.replace('_', ' ').toUpperCase()}
                        </h3>
                        {getStatusBadge(report.status)}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Reported {formatDate(report.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Reason:</span>
                    <p className="text-sm text-gray-900 dark:text-white mt-1">{report.reason}</p>
                  </div>

                  {report.description && (
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Description:</span>
                      <p className="text-sm text-gray-900 dark:text-white mt-1">{report.description}</p>
                    </div>
                  )}

                  {report.content_url && (
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Content URL:</span>
                      <a
                        href={report.content_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-purple-600 dark:text-purple-400 hover:underline ml-2"
                      >
                        {report.content_url}
                      </a>
                    </div>
                  )}

                  {report.moderation_notes && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                      <span className="text-sm font-medium text-blue-900 dark:text-blue-200">Moderation Notes:</span>
                      <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">{report.moderation_notes}</p>
                    </div>
                  )}

                  {report.action_taken && (
                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                      <span className="text-sm font-medium text-green-900 dark:text-green-200">Action Taken:</span>
                      <p className="text-sm text-green-800 dark:text-green-300 mt-1">{report.action_taken}</p>
                    </div>
                  )}
                </div>

                {report.status === 'pending' && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    {selectedReport?.id === report.id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Moderation Notes
                          </label>
                          <textarea
                            value={moderationNotes}
                            onChange={(e) => setModerationNotes(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-800"
                            rows={3}
                            placeholder="Add your moderation notes..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Action Taken
                          </label>
                          <input
                            type="text"
                            value={actionTaken}
                            onChange={(e) => setActionTaken(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white bg-white dark:bg-gray-800"
                            placeholder="e.g., User warned, Content removed, etc."
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleReviewReport(report.id, 'action_taken')}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                          >
                            Mark as Action Taken
                          </button>
                          <button
                            onClick={() => handleReviewReport(report.id, 'dismissed')}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={() => setSelectedReport(null)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedReport(report)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                      >
                        Review Report
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

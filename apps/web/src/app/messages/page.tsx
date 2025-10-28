'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

interface Conversation {
  id: string
  other_user: {
    id: string
    username: string
    display_name: string
    avatar_url?: string
  }
  last_message?: {
    content: string
    created_at: string
    sender_id: string
  }
  unread_count: number
  updated_at: string
}

export default function MessagesPage() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    fetchConversations()
  }, [authLoading, isAuthenticated, token])

  const fetchConversations = async () => {
    if (!token) return

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/direct/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Failed to load conversations')
      const data = await response.json()
      setConversations(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading || authLoading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">💬</div>
            <p className="text-xl text-gray-600 dark:text-gray-400">Loading messages...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      userName={user?.name ?? undefined}
      userEmail={user?.email ?? undefined}
      userAvatar={user?.image ?? undefined}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">Messages</h1>
          <p className="text-gray-600 dark:text-gray-400">Direct messages with other keepers</p>
        </div>
        {error && <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500/50 text-red-700 dark:text-red-300 rounded-xl">{error}</div>}

        {conversations.length === 0 ? (
          <div className="bg-surface rounded-2xl shadow-lg p-12 text-center border border-theme">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No messages yet</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Start a conversation with other keepers!</p>
            <Link
              href="/community"
              className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-semibold"
            >
              Browse Community
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl shadow-lg overflow-hidden border border-theme">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/messages/${conv.other_user.username}`}
                className="flex items-center gap-4 p-6 border-b border-gray-200 dark:border-gray-700 hover:bg-surface-elevated transition"
              >
                {conv.other_user.avatar_url ? (
                  <img
                    src={conv.other_user.avatar_url}
                    alt={conv.other_user.display_name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                    <span className="text-2xl">🕷️</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{conv.other_user.display_name}</h3>
                    {conv.last_message && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(conv.updated_at)}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">@{conv.other_user.username}</p>
                  {conv.last_message && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate mt-1">
                      {conv.last_message.content}
                    </p>
                  )}
                </div>
                {conv.unread_count > 0 && (
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-sm font-bold">
                      {conv.unread_count}
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

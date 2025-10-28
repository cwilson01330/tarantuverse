'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import DashboardLayout from '@/components/DashboardLayout'

interface Message {
  id: string
  content: string
  sender_id: string
  is_read: boolean
  created_at: string
  is_own: boolean
}

interface ConversationData {
  conversation_id: string | null
  other_user: {
    id: string
    username: string
    display_name: string
    avatar_url?: string
  }
  messages: Message[]
}

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const username = params?.username as string
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [conversation, setConversation] = useState<ConversationData | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !token) {
      router.push('/login')
      return
    }

    if (username) {
      fetchConversation()
    }
  }, [username, authLoading, isAuthenticated, token])

  useEffect(() => {
    scrollToBottom()
  }, [conversation?.messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchConversation = async () => {
    if (!token) return

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/direct/conversation/${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Failed to load conversation')
      const data = await response.json()
      setConversation(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || sending || !token) return

    setSending(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/direct/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipient_username: username,
          content: newMessage
        })
      })

      if (!response.ok) throw new Error('Failed to send message')

      setNewMessage('')
      fetchConversation() // Refresh
    } catch (err: any) {
      setError(err.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString()
    }
  }

  if (loading || authLoading) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">💬</div>
            <p className="text-xl text-gray-600 dark:text-gray-400">Loading conversation...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!conversation) {
    return (
      <DashboardLayout
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        userAvatar={user?.image ?? undefined}
      >
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Error loading conversation</h1>
            <Link href="/messages" className="text-primary-600 dark:text-primary-400 hover:underline">← Back to Messages</Link>
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
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-surface">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/messages" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                  ←
                </Link>
                {conversation.other_user.avatar_url ? (
                  <img
                    src={conversation.other_user.avatar_url}
                    alt={conversation.other_user.display_name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                    <span className="text-2xl">🕷️</span>
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{conversation.other_user.display_name}</h1>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">@{conversation.other_user.username}</p>
                </div>
              </div>
              <Link
                href={`/community/${conversation.other_user.username}`}
                className="px-4 py-2 bg-surface-elevated hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 font-medium text-sm text-theme-primary"
              >
                View Profile
              </Link>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto">
          {error && <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-500/50 text-red-700 dark:text-red-300 rounded-xl">{error}</div>}

          {conversation.messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👋</div>
              <p className="text-xl text-gray-600 dark:text-gray-400">Start the conversation!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversation.messages.map((msg, index) => {
                const showDate = index === 0 || formatDate(msg.created_at) !== formatDate(conversation.messages[index - 1].created_at)

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="text-center text-sm text-gray-500 dark:text-gray-400 my-4">
                        {formatDate(msg.created_at)}
                      </div>
                    )}
                    <div className={`flex ${msg.is_own ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-lg ${msg.is_own ? 'bg-primary-600 text-white' : 'bg-surface-elevated text-gray-900 dark:text-white'} rounded-2xl px-4 py-3 shadow`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.is_own ? 'text-primary-200' : 'text-gray-500 dark:text-gray-400'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 bg-surface">
          <form onSubmit={handleSend} className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex gap-3">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none bg-surface-elevated text-theme-primary"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e)
                  }
                }}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}

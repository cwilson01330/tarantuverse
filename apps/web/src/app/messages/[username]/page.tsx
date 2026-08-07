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

  // Notion feedback capture. Only offered on messages the OTHER person sent —
  // filing your own words as keeper feedback would be nonsense. Hidden entirely
  // when the integration isn't configured, rather than offering an action that
  // would fail.
  const [notionEnabled, setNotionEnabled] = useState(false)
  const [notionTarget, setNotionTarget] = useState<Message | null>(null)
  const [notionSummary, setNotionSummary] = useState('')
  const [notionBusy, setNotionBusy] = useState(false)
  const [notionResult, setNotionResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null)

  useEffect(() => {
    if (!token) return
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    fetch(`${API_URL}/api/v1/notion/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNotionEnabled(Boolean(d?.feedback_enabled)))
      .catch(() => setNotionEnabled(false))
  }, [token])

  const openNotion = (msg: Message) => {
    setNotionTarget(msg)
    setNotionResult(null)
    // Seed the summary with the opening of the message. It's a starting point
    // to edit, not a suggestion to accept — the whole point of the title is
    // that it's your read on what they said.
    setNotionSummary(msg.content.slice(0, 90))
  }

  const submitNotion = async () => {
    if (!notionTarget || !notionSummary.trim()) return
    setNotionBusy(true)
    setNotionResult(null)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(
        `${API_URL}/api/v1/notion/feedback/from-message/${notionTarget.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ summary: notionSummary.trim() }),
        }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.detail || `Failed (${response.status})`)
      setNotionResult({ ok: true, text: 'Saved to Notion', url: data?.url })
      setNotionTarget(null)
    } catch (e: any) {
      // Kept open on failure so the summary isn't lost and it can be retried.
      setNotionResult({ ok: false, text: e.message || 'Could not save' })
    } finally {
      setNotionBusy(false)
    }
  }

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
                    <div className={`group flex items-center gap-2 ${msg.is_own ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-lg ${msg.is_own ? 'bg-primary-600 text-white' : 'bg-surface-elevated text-gray-900 dark:text-white'} rounded-2xl px-4 py-3 shadow`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.is_own ? 'text-primary-200' : 'text-gray-500 dark:text-gray-400'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                      {/* Appears on hover so it doesn't clutter a conversation.
                          Incoming messages only — filing your own words as
                          keeper feedback makes no sense. */}
                      {notionEnabled && !msg.is_own && (
                        <button
                          onClick={() => openNotion(msg)}
                          title="Save to the Notion feedback log"
                          aria-label="Save this message to the Notion feedback log"
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-surface-elevated whitespace-nowrap"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Save-to-Notion confirmation. The message is quoted read-only — the
            only thing being authored here is the summary, because the report
            itself must reach the log in their words, not a paraphrase. */}
        {notionTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Save to the feedback log
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Filed against {conversation?.other_user.display_name || conversation?.other_user.username}.
              </p>

              <blockquote className="mt-4 max-h-40 overflow-y-auto rounded-lg border-l-4 border-gray-300 dark:border-gray-600 bg-surface-elevated px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {notionTarget.content}
              </blockquote>

              <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Summary
              </label>
              <input
                value={notionSummary}
                onChange={(e) => setNotionSummary(e.target.value)}
                maxLength={200}
                autoFocus
                className="mt-1 w-full rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-surface-elevated px-3 py-2 text-theme-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Your words, not theirs — this is the line you'll scan the log by later.
              </p>

              {notionResult && !notionResult.ok && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {notionResult.text}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setNotionTarget(null)}
                  disabled={notionBusy}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-surface-elevated disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitNotion}
                  disabled={notionBusy || !notionSummary.trim()}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {notionBusy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success confirmation, with a link straight to the new row. */}
        {notionResult?.ok && !notionTarget && (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-700">
            {notionResult.url ? (
              <a href={notionResult.url} target="_blank" rel="noopener noreferrer" className="underline">
                {notionResult.text} — open it
              </a>
            ) : (
              notionResult.text
            )}
            <button
              onClick={() => setNotionResult(null)}
              className="ml-3 text-gray-400 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

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

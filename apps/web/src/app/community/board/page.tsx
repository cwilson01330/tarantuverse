'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Message {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at?: string
  author_username?: string
  author_display_name?: string
  author_avatar_url?: string
}

export default function CommunityBoardPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
  })

  useEffect(() => {
    fetchMessages()
    checkAuth()
  }, [])

  const checkAuth = () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      // Decode token to get user info (simplified - you may want to fetch from API)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setCurrentUser({ id: payload.sub, username: payload.username })
      } catch (e) {
        console.error('Failed to decode token')
      }
    }
  }

  const fetchMessages = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages`)

      if (!response.ok) {
        throw new Error('Failed to fetch messages')
      }

      const data = await response.json()
      setMessages(data)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Failed to post message')
      }

      // Reset form and refresh
      setFormData({ title: '', content: '' })
      setShowForm(false)
      fetchMessages()
    } catch (err: any) {
      setError(err.message || 'Failed to post message')
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) {
      return
    }

    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/login')
      return
    }

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete message')
      }

      fetchMessages()
    } catch (err: any) {
      setError(err.message || 'Failed to delete message')
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">💬</div>
          <p className="text-gray-600">Loading messages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Community Board</h1>
              <p className="text-purple-100">Share updates, ask questions, and connect with keepers</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl">
            {error}
          </div>
        )}

        {/* New Message Button */}
        {currentUser && (
          <div className="mb-6">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 font-semibold shadow-lg flex items-center justify-center gap-2"
              >
                <span className="text-2xl">✍️</span>
                Post a Message
              </button>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg border border-purple-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">New Message</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="What's on your mind?"
                      required
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Message
                    </label>
                    <textarea
                      value={formData.content}
                      onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[120px]"
                      placeholder="Share your thoughts..."
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 font-semibold"
                    >
                      Post Message
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false)
                        setFormData({ title: '', content: '' })
                      }}
                      className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-200 font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {!currentUser && (
          <div className="mb-6 p-6 bg-purple-50 border border-purple-200 rounded-2xl text-center">
            <p className="text-gray-700 mb-3">Want to join the conversation?</p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 font-semibold"
            >
              Log In
            </button>
          </div>
        )}

        {/* Messages List */}
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-xl text-gray-600 mb-2">No messages yet</p>
              <p className="text-gray-500">Be the first to post!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200"
              >
                {/* Message Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                      {message.author_display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">
                        {message.author_display_name || 'Unknown User'}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>@{message.author_username || 'unknown'}</span>
                        <span>•</span>
                        <span>{formatDate(message.created_at)}</span>
                        {message.updated_at && message.updated_at !== message.created_at && (
                          <>
                            <span>•</span>
                            <span className="text-purple-600">edited</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Delete Button (only for message author) */}
                  {currentUser && message.user_id === currentUser.id && (
                    <button
                      onClick={() => handleDelete(message.id)}
                      className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 text-sm font-medium"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Message Content */}
                <div className="mb-2">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{message.title}</h3>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>
                </div>

                {/* View Profile Link */}
                {message.author_username && (
                  <button
                    onClick={() => router.push(`/keeper/${message.author_username}`)}
                    className="mt-3 text-purple-600 hover:text-purple-700 text-sm font-medium inline-flex items-center gap-1"
                  >
                    View Profile →
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

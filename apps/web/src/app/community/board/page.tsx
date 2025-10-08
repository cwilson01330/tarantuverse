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
  reply_count: number
  like_count: number
  reactions: Record<string, number>
  user_has_liked: boolean
  user_reactions: string[]
}

interface Reply {
  id: string
  message_id: string
  user_id: string
  content: string
  created_at: string
  author_username?: string
  author_display_name?: string
  author_avatar_url?: string
}

const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '🕷️', '🎉']

type SortOption = 'newest' | 'popular' | 'most_replies'

export default function CommunityBoardPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [formData, setFormData] = useState({ title: '', content: '' })
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [replies, setReplies] = useState<Record<string, Reply[]>>({})
  const [replyForms, setReplyForms] = useState<Record<string, string>>({})
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchMessages()
    checkAuth()
  }, [])

  const checkAuth = () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
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
      if (!response.ok) throw new Error('Failed to fetch messages')
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
    if (!token) { router.push('/login'); return }
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData),
      })
      if (!response.ok) throw new Error('Failed to post message')
      setFormData({ title: '', content: '' })
      setShowForm(false)
      fetchMessages()
    } catch (err: any) {
      setError(err.message || 'Failed to post message')
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!confirm('Are you sure?')) return
    const token = localStorage.getItem('auth_token')
    if (!token) return
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to delete')
      fetchMessages()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleLike = async (messageId: string) => {
    const token = localStorage.getItem('auth_token')
    if (!token) { router.push('/login'); return }
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/likes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to toggle like')
      fetchMessages() // Refresh to get updated counts
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    const token = localStorage.getItem('auth_token')
    if (!token) { router.push('/login'); return }
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ emoji }),
      })
      if (!response.ok) throw new Error('Failed to toggle reaction')
      fetchMessages()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const fetchReplies = async (messageId: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/replies`)
      if (!response.ok) throw new Error('Failed to fetch replies')
      const data = await response.json()
      setReplies(prev => ({ ...prev, [messageId]: data }))
    } catch (err: any) {
      console.error(err)
    }
  }

  const toggleReplies = (messageId: string) => {
    const newExpanded = new Set(expandedReplies)
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId)
    } else {
      newExpanded.add(messageId)
      fetchReplies(messageId)
    }
    setExpandedReplies(newExpanded)
  }

  const submitReply = async (messageId: string) => {
    const content = replyForms[messageId]
    if (!content?.trim()) return
    const token = localStorage.getItem('auth_token')
    if (!token) { router.push('/login'); return }
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) throw new Error('Failed to post reply')
      setReplyForms(prev => ({ ...prev, [messageId]: '' }))
      fetchReplies(messageId)
      fetchMessages() // Update reply count
    } catch (err: any) {
      setError(err.message)
    }
  }

  const deleteReply = async (replyId: string, messageId: string) => {
    if (!confirm('Delete this reply?')) return
    const token = localStorage.getItem('auth_token')
    if (!token) return
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_URL}/api/v1/messages/replies/${replyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to delete reply')
      fetchReplies(messageId)
      fetchMessages()
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Sorting and filtering logic
  const filteredAndSortedMessages = () => {
    let result = [...messages]

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(msg => 
        msg.title.toLowerCase().includes(query) ||
        msg.content.toLowerCase().includes(query) ||
        msg.author_display_name?.toLowerCase().includes(query) ||
        msg.author_username?.toLowerCase().includes(query)
      )
    }

    // Sort
    switch (sortBy) {
      case 'popular':
        result.sort((a, b) => b.like_count - a.like_count)
        break
      case 'most_replies':
        result.sort((a, b) => b.reply_count - a.reply_count)
        break
      case 'newest':
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return result
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
            <button onClick={() => router.push('/community')} className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-all duration-200 font-medium">
              ← Community
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl">{error}</div>}

        {/* Search and Sort Controls */}
        <div className="mb-6 bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 pl-12 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                <svg className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Sort */}
            <div className="sm:w-48">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all appearance-none bg-white cursor-pointer font-medium"
              >
                <option value="newest">🕐 Newest First</option>
                <option value="popular">❤️ Most Liked</option>
                <option value="most_replies">💬 Most Replies</option>
              </select>
            </div>
          </div>

          {/* Results count */}
          {searchQuery && (
            <p className="text-sm text-gray-600">
              Found {filteredAndSortedMessages().length} message{filteredAndSortedMessages().length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* New Message Button */}
        {currentUser && (
          <div className="mb-6">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl hover:from-purple-700 hover:to-purple-800 transition-all duration-200 font-semibold shadow-lg flex items-center justify-center gap-2">
                <span className="text-2xl">✍️</span> Post a Message
              </button>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg border border-purple-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">New Message</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
                    <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="What's on your mind?" required maxLength={200} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
                    <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[120px]" placeholder="Share your thoughts..." required />
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 font-semibold">Post Message</button>
                    <button type="button" onClick={() => { setShowForm(false); setFormData({ title: '', content: '' }) }} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-200 font-semibold">Cancel</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {!currentUser && (
          <div className="mb-6 p-6 bg-purple-50 border border-purple-200 rounded-2xl text-center">
            <p className="text-gray-700 mb-3">Want to join the conversation?</p>
            <button onClick={() => router.push('/login')} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all duration-200 font-semibold">Log In</button>
          </div>
        )}

        {/* Messages List */}
        <div className="space-y-4">
          {filteredAndSortedMessages().length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-xl text-gray-600 mb-2">{searchQuery ? 'No messages found' : 'No messages yet'}</p>
              <p className="text-gray-500">{searchQuery ? 'Try a different search term' : 'Be the first to post!'}</p>
            </div>
          ) : (
            filteredAndSortedMessages().map((message) => (
              <div key={message.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200">
                {/* Message Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                      {message.author_display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{message.author_display_name || 'Unknown User'}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>@{message.author_username || 'unknown'}</span>
                        <span>•</span>
                        <span>{formatDate(message.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {currentUser && message.user_id === currentUser.id && (
                    <button onClick={() => handleDelete(message.id)} className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 text-sm font-medium">Delete</button>
                  )}
                </div>

                {/* Message Content */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{message.title}</h3>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{message.content}</p>
                </div>

                {/* Interactions */}
                <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                  {/* Like Button */}
                  <button onClick={() => currentUser ? toggleLike(message.id) : router.push('/login')} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${message.user_has_liked ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    <span className="text-lg">{message.user_has_liked ? '❤️' : '🤍'}</span>
                    <span className="font-semibold">{message.like_count}</span>
                  </button>

                  {/* Reply Button */}
                  <button onClick={() => toggleReplies(message.id)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-all">
                    <span className="text-lg">💬</span>
                    <span className="font-semibold">{message.reply_count}</span>
                  </button>

                  {/* Reaction Buttons */}
                  <div className="flex items-center gap-1">
                    {REACTION_EMOJIS.map(emoji => {
                      const count = message.reactions[emoji] || 0
                      const userReacted = message.user_reactions.includes(emoji)
                      return (
                        <button key={emoji} onClick={() => currentUser ? toggleReaction(message.id, emoji) : router.push('/login')} className={`px-2 py-1 rounded-lg text-lg transition-all ${userReacted ? 'bg-purple-100 scale-110' : 'bg-gray-50 hover:bg-gray-100'}`} title={`${count} ${emoji}`}>
                          {emoji}{count > 0 && <span className="text-xs ml-1 font-semibold">{count}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Replies Section */}
                {expandedReplies.has(message.id) && (
                  <div className="mt-4 space-y-3">
                    {/* Reply Form */}
                    {currentUser && (
                      <div className="flex gap-2">
                        <input type="text" value={replyForms[message.id] || ''} onChange={(e) => setReplyForms(prev => ({ ...prev, [message.id]: e.target.value }))} placeholder="Write a reply..." className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" onKeyPress={(e) => e.key === 'Enter' && submitReply(message.id)} />
                        <button onClick={() => submitReply(message.id)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold">Reply</button>
                      </div>
                    )}

                    {/* Replies List */}
                    {replies[message.id]?.map(reply => (
                      <div key={reply.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {reply.author_display_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <span className="font-semibold text-gray-900">{reply.author_display_name}</span>
                              <span className="text-gray-500 ml-2">{formatDate(reply.created_at)}</span>
                            </div>
                            {currentUser && reply.user_id === currentUser.id && (
                              <button onClick={() => deleteReply(reply.id, message.id)} className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs font-medium">Delete</button>
                            )}
                          </div>
                          <p className="text-gray-700 mt-1">{reply.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [token, setToken] = useState<string | null>(null)

    const [requestEmail, setRequestEmail] = useState('')
    const [formData, setFormData] = useState({
        password: '',
        confirmPassword: ''
    })
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [requestSuccess, setRequestSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const t = searchParams.get('token')
        if (t) {
            setToken(t)
        }
    }, [searchParams])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters')
            return
        }

        if (!token) {
            setError('Missing reset token. Please check the link in your email.')
            return
        }

        setLoading(true)

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token,
                    new_password: formData.password
                })
            })

            if (response.ok) {
                setSuccess(true)
                setTimeout(() => {
                    router.push('/login')
                }, 3000)
            } else {
                const data = await response.json()
                throw new Error(data.detail || 'Failed to reset password')
            }
        } catch (err: any) {
            setError(err.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setRequestSuccess(false)
        setLoading(true)

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: requestEmail
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to send reset email')
            }

            setRequestSuccess(true)
        } catch (err: any) {
            setError(err.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="flex min-h-screen items-center justify-center p-24">
                <div className="w-full max-w-md p-8 bg-green-50 rounded-lg border border-green-200">
                    <h2 className="text-2xl font-bold text-green-800 mb-4">Password Reset Successful!</h2>
                    <p className="text-green-700">Your password has been updated. Redirecting to login...</p>
                    <Link href="/login" className="mt-4 inline-block text-green-600 font-medium hover:underline">
                        Click here if not redirected
                    </Link>
                </div>
            </div>
        )
    }

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center p-24">
                <div className="w-full max-w-md">
                    <h1 className="text-4xl font-bold mb-2 text-center">Forgot Password</h1>
                    <p className="text-gray-600 mb-8 text-center">Enter your email and we&apos;ll send a reset link.</p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    {requestSuccess && (
                        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
                            If an account exists for that email, a password reset link has been sent.
                        </div>
                    )}

                    <form onSubmit={handleRequestReset} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Email</label>
                            <input
                                type="email"
                                required
                                value={requestEmail}
                                onChange={(e) => setRequestEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 bg-white"
                                placeholder="you@example.com"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-24">
            <div className="w-full max-w-md">
                <h1 className="text-4xl font-bold mb-2 text-center">Reset Password</h1>
                <p className="text-gray-600 mb-8 text-center">Enter your new password below</p>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">New Password</label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 bg-white"
                            placeholder="••••••••"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Confirm Password</label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 bg-white"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !token}
                        className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Reseting...' : 'Reset Password'}
                    </button>
                </form>
            </div>
        </div>
    )
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ResetPasswordForm />
        </Suspense>
    )
}

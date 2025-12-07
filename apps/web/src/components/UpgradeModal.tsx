'use client';

import { useEffect } from 'react';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    message?: string;
    feature?: string;
}

export default function UpgradeModal({
    isOpen,
    onClose,
    title = "Upgrade to Premium",
    message = "Unlock unlimited tracking and breeding features",
    feature
}: UpgradeModalProps) {
    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    const plans = [
        {
            name: 'Monthly',
            price: '$4.99',
            period: '/month',
            description: 'Perfect for trying premium',
            features: ['Cancel anytime', 'All premium features'],
            popular: false
        },
        {
            name: 'Yearly',
            price: '$44.99',
            period: '/year',
            description: 'Best value - Save 25%',
            features: ['2 months free', 'All premium features'],
            popular: true,
            savings: 'Save $15/year'
        },
        {
            name: 'Lifetime',
            price: '$149.99',
            period: 'one-time',
            description: 'Never pay again',
            features: ['Pay once, own forever', 'All future features included'],
            popular: false,
            badge: 'Best Deal'
        }
    ];

    const premiumFeatures = [
        'Unlimited tarantulas',
        'Unlimited photo uploads',
        'Full breeding module (pairings, egg sacs, offspring)',
        'Advanced analytics & insights',
        'Data export (CSV/PDF)',
        'Priority support',
        'Early access to new features'
    ];

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 dark:bg-black/70 transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 animate-in fade-in zoom-in duration-200">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {title}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    {message}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {feature && (
                        <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                            <p className="text-sm text-purple-900 dark:text-purple-200">
                                <strong>{feature}</strong> is a premium feature. Upgrade to unlock it!
                            </p>
                        </div>
                    )}

                    {/* Pricing Cards */}
                    <div className="grid md:grid-cols-3 gap-4 mb-6">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`relative rounded-xl border-2 p-6 transition ${
                                    plan.popular
                                        ? 'border-purple-600 dark:border-purple-500 shadow-lg scale-105'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                                }`}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                                            Most Popular
                                        </span>
                                    </div>
                                )}
                                {plan.badge && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                                            {plan.badge}
                                        </span>
                                    </div>
                                )}

                                <div className="text-center mb-4">
                                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                                        {plan.name}
                                    </h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                        {plan.description}
                                    </p>
                                    <div className="mb-2">
                                        <span className="text-3xl font-bold text-gray-900 dark:text-white">
                                            {plan.price}
                                        </span>
                                        <span className="text-gray-600 dark:text-gray-400 text-sm ml-1">
                                            {plan.period}
                                        </span>
                                    </div>
                                    {plan.savings && (
                                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                                            {plan.savings}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2 mb-4">
                                    {plan.features.map((feature, i) => (
                                        <div key={i} className="flex items-center text-sm">
                                            <svg className="w-4 h-4 text-green-600 dark:text-green-400 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    className={`w-full py-2.5 rounded-lg font-semibold transition ${
                                        plan.popular
                                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    Choose {plan.name}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Premium Features List */}
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 mb-6">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            What's Included in Premium
                        </h4>
                        <div className="grid md:grid-cols-2 gap-3">
                            {premiumFeatures.map((feature, i) => (
                                <div key={i} className="flex items-start">
                                    <svg className="w-5 h-5 text-purple-600 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Have a promo code?{' '}
                            <a href="/dashboard/settings" className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium">
                                Redeem here
                            </a>
                        </p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                        >
                            Maybe Later
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

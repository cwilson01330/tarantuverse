import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/contexts/ThemeContext';

export default function PricingScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const handleChoosePlan = () => {
    router.push('/subscription');
  };

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '/forever',
      description: 'Perfect for casual keepers with small collections',
      features: [
        'Up to 15 tarantulas',
        '5 photos per tarantula',
        'Feeding & molt tracking',
        'Basic analytics',
        'Community access',
        'Mobile app access',
      ],
      cta: 'Get Started Free',
      popular: false,
    },
    {
      name: 'Monthly',
      price: '$4.99',
      period: '/month',
      description: 'Perfect for trying premium features',
      features: [
        'Everything in Free, plus:',
        'Unlimited tarantulas',
        'Unlimited photos',
        'Full breeding module',
        'Advanced analytics',
        'Priority support',
        'Cancel anytime',
      ],
      cta: 'Choose Monthly',
      popular: false,
    },
    {
      name: 'Yearly',
      price: '$44.99',
      period: '/year',
      description: 'Best value - Save 25%',
      savings: 'Save $15/year',
      features: [
        'Everything in Monthly, plus:',
        '2 months FREE',
        'Save $15 per year',
        'All premium features',
      ],
      cta: 'Choose Yearly',
      popular: true,
    },
  ];

  const lifetimePlan = {
    name: 'Lifetime Access',
    price: '$149.99',
    description: 'Pay once, own forever',
    subtitle: 'No recurring fees. All future features included.',
    features: [
      'Everything in Premium',
      'Lifetime access',
      'All future features',
      'No recurring fees',
    ],
    cta: 'Get Lifetime Access',
  };

  const comparisonFeatures = [
    { name: 'Tarantulas', free: '15', premium: 'Unlimited' },
    { name: 'Photos per tarantula', free: '5', premium: 'Unlimited' },
    { name: 'Breeding module', free: '-', premium: '✓' },
    { name: 'Analytics', free: 'Basic', premium: 'Advanced' },
    { name: 'Priority support', free: '-', premium: '✓' },
    { name: 'Data export (CSV/PDF)', free: '-', premium: '✓' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: theme.text }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Simple, Transparent Pricing</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Start free with generous limits. Upgrade for unlimited tracking and breeding features.
        </Text>
      </View>

      {/* Pricing Cards */}
      <View style={styles.plansContainer}>
        {plans.map((plan) => (
          <View
            key={plan.name}
            style={[
              styles.planCard,
              { backgroundColor: theme.surface, borderColor: plan.popular ? '#a855f7' : theme.border },
              plan.popular && styles.planCardPopular,
            ]}
          >
            {plan.popular && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
              </View>
            )}

            <Text style={[styles.planName, { color: theme.text }]}>{plan.name}</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: theme.text }]}>{plan.price}</Text>
              <Text style={[styles.period, { color: theme.textSecondary }]}>{plan.period}</Text>
            </View>
            {plan.savings && (
              <Text style={styles.savings}>{plan.savings}</Text>
            )}
            <Text style={[styles.planDescription, { color: theme.textSecondary }]}>
              {plan.description}
            </Text>

            <View style={styles.featuresContainer}>
              {plan.features.map((feature, i) => (
                <View key={i} style={styles.featureRow}>
                  <Text style={styles.checkIcon}>✓</Text>
                  <Text style={[styles.featureText, { color: theme.textSecondary }]}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.ctaButton,
                plan.popular
                  ? styles.ctaButtonPopular
                  : { backgroundColor: theme.isDark ? theme.backgroundElevated : '#f3f4f6', borderColor: theme.border },
              ]}
              onPress={plan.name === 'Free' ? () => router.push('/register') : handleChoosePlan}
            >
              <Text
                style={[
                  styles.ctaButtonText,
                  { color: plan.popular ? '#fff' : theme.text },
                ]}
              >
                {plan.cta}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Lifetime Plan - Standalone */}
      <View style={[styles.lifetimeCard, { backgroundColor: '#fbbf24' }]}>
        <View style={styles.bestDealBadge}>
          <Text style={styles.bestDealBadgeText}>BEST DEAL</Text>
        </View>
        <Text style={styles.lifetimeName}>{lifetimePlan.name}</Text>
        <Text style={styles.lifetimePrice}>{lifetimePlan.price}</Text>
        <Text style={styles.lifetimeDescription}>{lifetimePlan.description}</Text>
        <Text style={styles.lifetimeSubtitle}>{lifetimePlan.subtitle}</Text>

        <View style={styles.lifetimeFeaturesContainer}>
          {lifetimePlan.features.map((feature, i) => (
            <View key={i} style={styles.lifetimeFeatureRow}>
              <Text style={styles.checkIconWhite}>✓</Text>
              <Text style={styles.lifetimeFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.lifetimeButton} onPress={handleChoosePlan}>
          <Text style={styles.lifetimeButtonText}>{lifetimePlan.cta}</Text>
        </TouchableOpacity>
      </View>

      {/* Feature Comparison Table */}
      <View style={[styles.comparisonSection, { backgroundColor: theme.surface }]}>
        <Text style={[styles.comparisonTitle, { color: theme.text }]}>Feature Comparison</Text>
        <View style={styles.comparisonTable}>
          <View style={[styles.comparisonHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.comparisonHeaderText, { color: theme.text }]}>Feature</Text>
            <Text style={[styles.comparisonHeaderText, { color: theme.text }]}>Free</Text>
            <Text style={[styles.comparisonHeaderText, { color: '#a855f7' }]}>Premium</Text>
          </View>
          {comparisonFeatures.map((feature, i) => (
            <View
              key={i}
              style={[
                styles.comparisonRow,
                { backgroundColor: i % 2 === 0 ? theme.backgroundElevated : 'transparent', borderBottomColor: theme.border },
              ]}
            >
              <Text style={[styles.comparisonFeatureName, { color: theme.text }]}>
                {feature.name}
              </Text>
              <Text style={[styles.comparisonValue, { color: theme.textSecondary }]}>
                {feature.free}
              </Text>
              <Text style={[styles.comparisonValuePremium, { color: '#a855f7' }]}>
                {feature.premium}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* FAQ */}
      <View style={[styles.faqSection, { backgroundColor: theme.surface }]}>
        <Text style={[styles.faqTitle, { color: theme.text }]}>Frequently Asked Questions</Text>

        <View style={styles.faqItem}>
          <Text style={[styles.faqQuestion, { color: theme.text }]}>
            Can I change plans later?
          </Text>
          <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>
            Yes! You can upgrade at any time. If you have a promo code, you can redeem it in your settings.
          </Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={[styles.faqQuestion, { color: theme.text }]}>
            What happens if I exceed my plan limits?
          </Text>
          <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>
            We'll show you a friendly upgrade prompt when you hit your limit. Your data is never deleted, and you can upgrade anytime.
          </Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={[styles.faqQuestion, { color: theme.text }]}>
            Do you offer promo codes?
          </Text>
          <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>
            Yes! Early adopters may receive promo codes for free premium access. If you have a code, you can redeem it in your account settings.
          </Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={[styles.faqQuestion, { color: theme.text }]}>
            Can I cancel my monthly subscription?
          </Text>
          <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>
            Absolutely! Monthly plans can be canceled anytime from your account settings. No long-term contracts.
          </Text>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Ready to Start Your Journey?</Text>
        <Text style={styles.ctaSubtitle}>Join the community of tarantula keepers today</Text>
        <TouchableOpacity
          style={styles.ctaSectionButton}
          onPress={() => router.push('/register')}
        >
          <Text style={styles.ctaSectionButtonText}>Get Started Free</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  plansContainer: {
    padding: 20,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
    marginBottom: 16,
    position: 'relative',
  },
  planCardPopular: {
    borderColor: '#a855f7',
    transform: [{ scale: 1.02 }],
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: '#a855f7',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  price: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  period: {
    fontSize: 16,
    marginLeft: 4,
  },
  savings: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginBottom: 8,
  },
  planDescription: {
    fontSize: 14,
    marginBottom: 16,
  },
  featuresContainer: {
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkIcon: {
    color: '#10b981',
    fontSize: 18,
    marginRight: 8,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
  },
  ctaButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  ctaButtonPopular: {
    backgroundColor: '#a855f7',
    borderWidth: 0,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  lifetimeCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    position: 'relative',
  },
  bestDealBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: '#7c3aed',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bestDealBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  lifetimeName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  lifetimePrice: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  lifetimeDescription: {
    fontSize: 18,
    color: '#000',
    fontWeight: '600',
    marginBottom: 4,
  },
  lifetimeSubtitle: {
    fontSize: 14,
    color: '#000',
    opacity: 0.8,
    marginBottom: 16,
  },
  lifetimeFeaturesContainer: {
    marginBottom: 16,
  },
  lifetimeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkIconWhite: {
    color: '#000',
    fontSize: 18,
    marginRight: 8,
  },
  lifetimeFeatureText: {
    fontSize: 14,
    color: '#000',
    flex: 1,
  },
  lifetimeButton: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  lifetimeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  comparisonSection: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  comparisonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  comparisonTable: {},
  comparisonHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  comparisonHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  comparisonFeatureName: {
    flex: 1,
    fontSize: 14,
    paddingLeft: 8,
  },
  comparisonValue: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  comparisonValuePremium: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  faqSection: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  faqTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 20,
  },
  ctaSection: {
    backgroundColor: '#a855f7',
    padding: 32,
    marginHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  ctaSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaSectionButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  ctaSectionButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#a855f7',
  },
});

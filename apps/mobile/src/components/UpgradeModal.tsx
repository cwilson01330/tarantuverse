import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  feature?: string;
}

export default function UpgradeModal({
  visible,
  onClose,
  title = 'Upgrade to Premium',
  message = 'Unlock unlimited tracking and breeding features',
  feature,
}: UpgradeModalProps) {
  const { theme } = useTheme();
  const router = useRouter();

  const handleUpgrade = () => {
    onClose();
    router.push('/subscription');
  };

  const plans = [
    {
      name: 'Monthly',
      price: '$4.99',
      period: '/month',
      description: 'Perfect for trying premium',
      features: ['Cancel anytime', 'All premium features'],
      popular: false,
    },
    {
      name: 'Yearly',
      price: '$44.99',
      period: '/year',
      description: 'Best value - Save 25%',
      features: ['2 months free', 'All premium features'],
      popular: true,
      savings: 'Save $15/year',
    },
    {
      name: 'Lifetime',
      price: '$149.99',
      period: 'one-time',
      description: 'Never pay again',
      features: ['Pay once, own forever', 'All future features included'],
      popular: false,
      badge: 'Best Deal',
    },
  ];

  const premiumFeatures = [
    'Unlimited tarantulas',
    'Unlimited photo uploads',
    'Full breeding module (pairings, egg sacs, offspring)',
    'Advanced analytics & insights',
    'Data export (CSV/PDF)',
    'Priority support',
    'Early access to new features',
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>✨</Text>
              </View>
              <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {message}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Feature Callout */}
            {feature && (
              <View style={[styles.featureCallout, { backgroundColor: theme.isDark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.1)', borderColor: theme.isDark ? 'rgba(168, 85, 247, 0.5)' : 'rgba(168, 85, 247, 0.3)' }]}>
                <Text style={[styles.featureCalloutText, { color: theme.text }]}>
                  <Text style={styles.bold}>{feature}</Text> is a premium feature. Upgrade to unlock it!
                </Text>
              </View>
            )}

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
                      <Text style={styles.popularBadgeText}>Most Popular</Text>
                    </View>
                  )}
                  {plan.badge && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularBadgeText}>{plan.badge}</Text>
                    </View>
                  )}

                  <View style={styles.planHeader}>
                    <Text style={[styles.planName, { color: theme.text }]}>{plan.name}</Text>
                    <Text style={[styles.planDescription, { color: theme.textSecondary }]}>
                      {plan.description}
                    </Text>
                    <View style={styles.priceContainer}>
                      <Text style={[styles.price, { color: theme.text }]}>{plan.price}</Text>
                      <Text style={[styles.period, { color: theme.textSecondary }]}>{plan.period}</Text>
                    </View>
                    {plan.savings && (
                      <Text style={styles.savings}>{plan.savings}</Text>
                    )}
                  </View>

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
                      styles.chooseButton,
                      plan.popular
                        ? styles.chooseButtonPopular
                        : { backgroundColor: theme.isDark ? theme.backgroundElevated : '#f3f4f6', borderColor: theme.border },
                    ]}
                    onPress={handleUpgrade}
                  >
                    <Text
                      style={[
                        styles.chooseButtonText,
                        { color: plan.popular ? '#fff' : theme.text },
                      ]}
                    >
                      Choose {plan.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Premium Features List */}
            <View style={[styles.premiumSection, { backgroundColor: theme.backgroundElevated }]}>
              <View style={styles.premiumHeader}>
                <Text style={styles.sparkleIcon}>✨</Text>
                <Text style={[styles.premiumTitle, { color: theme.text }]}>
                  What's Included in Premium
                </Text>
              </View>
              <View style={styles.premiumFeaturesGrid}>
                {premiumFeatures.map((feature, i) => (
                  <View key={i} style={styles.premiumFeatureRow}>
                    <Text style={styles.checkIconPurple}>✓</Text>
                    <Text style={[styles.premiumFeatureText, { color: theme.textSecondary }]}>
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Have a promo code?{' '}
                <Text style={styles.footerLink}>Redeem in settings</Text>
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.maybeLaterButton}>
                <Text style={[styles.maybeLaterText, { color: theme.textSecondary }]}>
                  Maybe Later
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'linear-gradient(135deg, #a855f7, #ec4899)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: '300',
  },
  featureCallout: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  featureCalloutText: {
    fontSize: 14,
  },
  bold: {
    fontWeight: 'bold',
  },
  plansContainer: {
    marginBottom: 20,
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
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: 'linear-gradient(90deg, #a855f7, #ec4899)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  planHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  planDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  period: {
    fontSize: 14,
    marginLeft: 4,
  },
  savings: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
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
    fontSize: 16,
    marginRight: 8,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
  },
  chooseButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  chooseButtonPopular: {
    backgroundColor: 'linear-gradient(90deg, #a855f7, #ec4899)',
    borderWidth: 0,
  },
  chooseButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  premiumSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sparkleIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  premiumFeaturesGrid: {
    gap: 12,
  },
  premiumFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkIconPurple: {
    color: '#a855f7',
    fontSize: 18,
    marginRight: 8,
    marginTop: 2,
  },
  premiumFeatureText: {
    fontSize: 14,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    color: '#a855f7',
    fontWeight: '600',
  },
  maybeLaterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  maybeLaterText: {
    fontSize: 14,
  },
});

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';
import { completeOnboarding } from '../src/lib/onboarding';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface OnboardingScreen {
  id: number;
  title: string;
  description: string;
  icon: string;
  emoji: string;
}

/**
 * Copy rewritten 2026-09-18. The original was written when this was a
 * tarantula-only app and had never actually been shown to anyone, so turning
 * the carousel on would have pitched a product we stopped shipping — four
 * screens telling a scorpion keeper they were in the wrong place.
 *
 * Two things here are deliberate and worth keeping:
 *
 *  - Screen 3 does NOT promise "smart insights". Premolt prediction can only
 *    compute an interval for a small fraction of animals, because it needs
 *    molt history the keeper hasn't logged yet. "Built from your own logs, so
 *    they sharpen the longer you keep them" is true, sets the right
 *    expectation, and points at the behaviour we actually want.
 *  - "Hundreds of species care guides" rather than a figure. The real number
 *    moves every time we seed, and a stale count in onboarding is the same
 *    mistake as the storefront's "550+".
 *
 * Icons are MaterialCommunityIcons names verified against shipping screens.
 * The originals (clipboard-list, chart-line) only ever appeared in this
 * unreachable file, so they had never rendered — an unverified MDI name shows
 * up as a blank box in production.
 */
const SCREENS: OnboardingScreen[] = [
  {
    id: 1,
    title: 'Welcome to Tarantuverse',
    description:
      'A husbandry tracker for the whole invertebrate side of the hobby — tarantulas, scorpions, centipedes, mantises, isopods and more.',
    icon: 'paw',
    emoji: '🐾',
  },
  {
    id: 2,
    title: 'Log it as you go',
    description:
      'Feedings, molts, substrate changes and water. Track animals one by one, or a whole colony as headcounts. Already keep a spreadsheet? Import it.',
    icon: 'silverware-fork-knife',
    emoji: '🍽️',
  },
  {
    id: 3,
    title: 'Care sheets and your own history',
    description:
      'Hundreds of species care guides are built in. Premolt predictions and growth charts are built from your own logs, so they sharpen the longer you keep them.',
    icon: 'book-open-variant',
    emoji: '📖',
  },
  {
    id: 4,
    title: 'Community, if you want it',
    description:
      'Forums, keeper profiles and messages for when you want a second opinion. Your collection stays private unless you choose to share it.',
    icon: 'comment-multiple',
    emoji: '💬',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentScreen, setCurrentScreen] = useState(0);

  const handleNext = () => {
    if (currentScreen < SCREENS.length - 1) {
      const nextScreen = currentScreen + 1;
      setCurrentScreen(nextScreen);
      scrollViewRef.current?.scrollTo({
        x: nextScreen * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  const handleGetStarted = async () => {
    // completeOnboarding clears the pending marker as well as setting the
    // completed flag — see src/lib/onboarding.ts for why those are two keys.
    // It swallows storage errors, so the navigation below always runs: never
    // trap someone on the carousel because AsyncStorage hiccuped.
    await completeOnboarding();
    router.replace('/(tabs)');
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollX = event.nativeEvent.contentOffset.x;
    const screenIndex = Math.round(scrollX / SCREEN_WIDTH);
    setCurrentScreen(screenIndex);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    screen: {
      width: SCREEN_WIDTH,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingVertical: 60,
    },
    emojiContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 32,
      borderWidth: 2,
      borderColor: colors.border,
    },
    emoji: {
      fontSize: 64,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
      textAlign: 'center',
    },
    description: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 24,
      backgroundColor: colors.background,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    activeDot: {
      backgroundColor: colors.primary,
      width: 32,
    },
    footer: {
      paddingHorizontal: 32,
      paddingBottom: 32,
      gap: 12,
    },
    button: {
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    skipButton: {
      alignSelf: 'flex-end',
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginRight: 16,
      marginTop: 8,
    },
    skipButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
  });

  const isLastScreen = currentScreen === SCREENS.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      {currentScreen < SCREENS.length && (
        <TouchableOpacity style={styles.skipButton} onPress={handleGetStarted}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        onScroll={handleScroll}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={styles.scrollView}
      >
        {SCREENS.map((screen) => (
          <View key={screen.id} style={styles.screen}>
            <View style={styles.emojiContainer}>
              <Text style={styles.emoji}>{screen.emoji}</Text>
            </View>
            <Text style={styles.title}>{screen.title}</Text>
            <Text style={styles.description}>{screen.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dotsContainer}>
        {SCREENS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentScreen === index && styles.activeDot,
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={isLastScreen ? handleGetStarted : handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {isLastScreen ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>

        {!isLastScreen && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleGetStarted}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Skip for Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

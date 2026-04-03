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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/contexts/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface OnboardingScreen {
  id: number;
  title: string;
  description: string;
  icon: string;
  emoji: string;
}

const SCREENS: OnboardingScreen[] = [
  {
    id: 1,
    title: 'Welcome to Tarantuverse',
    description: 'Track, care for, and connect with other tarantula enthusiasts in one place',
    icon: 'spider',
    emoji: '🕷️',
  },
  {
    id: 2,
    title: 'Track Your Collection',
    description:
      'Log feeding times, molts, and substrate changes. Monitor growth and get insights into your tarantulas\' health and behavior.',
    icon: 'clipboard-list',
    emoji: '📋',
  },
  {
    id: 3,
    title: 'Get Smart Insights',
    description:
      'Discover analytics about your collection, premolt predictions, and growth tracking to help you care better.',
    icon: 'chart-line',
    emoji: '📊',
  },
  {
    id: 4,
    title: 'Join the Community',
    description:
      'Connect with other keepers, share knowledge in forums, follow experts, and grow your community.',
    icon: 'forum',
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
    try {
      await AsyncStorage.setItem('onboarding_completed', 'true');
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error saving onboarding status:', error);
      router.replace('/(tabs)');
    }
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

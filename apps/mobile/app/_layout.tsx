import React, { useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { ThemeProvider } from '../src/contexts/ThemeContext';

function RootLayoutContent() {
  const { user, isLoading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, [user]);

  const checkOnboardingStatus = async () => {
    try {
      if (user) {
        const completed = await AsyncStorage.getItem('onboarding_completed');
        setOnboardingComplete(completed === 'true');
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setOnboardingComplete(false);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  // Don't render until both auth and onboarding check are complete
  if (isLoading || checkingOnboarding) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      {/* Show onboarding if user is authenticated but hasn't completed it */}
      {user && !onboardingComplete && (
        <Stack.Screen name="onboarding" options={{ animationEnabled: false }} />
      )}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

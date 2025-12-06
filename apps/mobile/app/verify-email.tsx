import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/contexts/ThemeContext';
import { apiClient } from '../src/services/api';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useLocalSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found.');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await apiClient.post(`/auth/verify-email?token=${token}`);

        if (response.status === 200) {
          setStatus('success');
          setMessage('Email verified successfully! You can now log in.');
        } else {
          setStatus('error');
          setMessage(response.data?.detail || 'Verification failed. The token may be invalid or expired.');
        }
      } catch (error: any) {
        setStatus('error');
        setMessage(error.response?.data?.detail || 'An error occurred during verification.');
      }
    };

    verifyEmail();
  }, [token]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    icon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    iconText: {
      fontSize: 32,
      color: '#fff',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 16,
    },
    message: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      paddingHorizontal: 32,
      alignItems: 'center',
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    linkButton: {
      marginTop: 16,
    },
    linkText: {
      color: colors.primary,
      fontSize: 14,
    },
  });

  return (
    <View style={styles.container}>
      {status === 'verifying' && (
        <>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
          <Text style={styles.message}>{message}</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <View style={[styles.icon, { backgroundColor: '#10B981' }]}>
            <Text style={styles.iconText}>✓</Text>
          </View>
          <Text style={[styles.title, { color: '#10B981' }]}>Success!</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'error' && (
        <>
          <View style={[styles.icon, { backgroundColor: '#EF4444' }]}>
            <Text style={styles.iconText}>✕</Text>
          </View>
          <Text style={[styles.title, { color: '#EF4444' }]}>Error</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity style={styles.linkButton} onPress={() => router.replace('/register')}>
            <Text style={styles.linkText}>Back to Register</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

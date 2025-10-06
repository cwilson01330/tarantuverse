import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../src/contexts/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🕷️</Text>
      <ActivityIndicator size="large" color="#7c3aed" />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  logo: {
    fontSize: 80,
    marginBottom: 20,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
});

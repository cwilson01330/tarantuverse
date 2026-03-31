import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../src/contexts/AuthContext';
import { useTheme } from '../src/contexts/ThemeContext';

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    logo: {
      fontSize: 80,
      marginBottom: 20,
    },
    text: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textTertiary,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🕷️</Text>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>Loading...</Text>
    </View>
  );
}

import { Stack } from 'expo-router';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function MessagesLayout() {
  const { colors, layout } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerBackground: () =>
          layout.useGradient ? (
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: colors.surface,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            />
          ),
        headerTintColor: layout.useGradient ? '#fff' : colors.textPrimary,
        headerTitleStyle: {
          fontWeight: 'bold' as const,
          color: layout.useGradient ? '#fff' : colors.textPrimary,
        },
        headerShadowVisible: false,
        headerBackTitle: 'Messages',
      }}
    >
      {/* index uses AppHeader directly (headerShown: false set inline) */}
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen name="[username]" />
    </Stack>
  );
}

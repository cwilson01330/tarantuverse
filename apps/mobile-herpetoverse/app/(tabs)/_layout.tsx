/**
 * Tab skeleton for Herpetoverse mobile v1.
 *
 *   Collection   → /(tabs)/index          (snakes + lizards, Bundle 2)
 *   Species      → /(tabs)/species        (care sheets, Bundle 4)
 *   Profile      → /(tabs)/profile        (settings + logout, Bundle 1)
 *
 * Community tabs (messages, forums, followers) are explicitly out of
 * scope for mobile v1 per the sprint plan.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const { colors, layout } = useTheme();

  // If somehow we arrive here unauthenticated (stale deep link, cleared
  // session during background), bounce to login. `isLoading` is already
  // guarded by the root layout so this runs only after auth resolves.
  if (!isLoading && !user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerBackground: () =>
          layout.useGradient ? (
            <LinearGradient
              colors={[colors.surface, colors.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
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
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '700',
          color: colors.textPrimary,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Collection',
          tabBarLabel: 'Collection',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="snake" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="species"
        options={{
          title: 'Species',
          tabBarLabel: 'Species',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

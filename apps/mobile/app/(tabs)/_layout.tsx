import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'My Tarantulas',
          tabBarLabel: 'Tarantulas',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="spider" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="enclosures"
        options={{
          href: null, // Hidden from tab bar, still accessible via navigation
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="forums"
        options={{
          href: null, // Accessible from Community tab
        }}
      />
      <Tabs.Screen
        name="species"
        options={{
          href: null, // Accessible via Search and species links
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarLabel: 'Search',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="magnify" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

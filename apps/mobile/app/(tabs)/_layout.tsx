import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useUnreadMessages } from '../../src/hooks/useUnreadMessages';

export default function TabLayout() {
  const { colors, layout } = useTheme();
  const router = useRouter();
  const { unreadCount } = useUnreadMessages();

  const tintColor = layout.useGradient ? '#fff' : colors.textPrimary;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        // Keeper preset: flat compact header. Hobbyist: full gradient.
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
        headerTintColor: tintColor,
        headerTitleStyle: {
          fontWeight: 'bold',
          color: tintColor,
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
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/messages' as any)}
              style={styles.headerButton}
              accessibilityLabel={
                unreadCount > 0
                  ? `Messages — ${unreadCount} unread`
                  : 'Messages'
              }
            >
              <MaterialCommunityIcons name="message-outline" size={24} color={tintColor} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
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
          headerRight: ({ tintColor: tc }) => (
            <TouchableOpacity
              onPress={() => router.push('/discover')}
              style={styles.headerButton}
              accessibilityLabel="Discover community"
            >
              <MaterialCommunityIcons name="star" size={24} color={tc} />
            </TouchableOpacity>
          ),
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

const styles = StyleSheet.create({
  headerButton: {
    marginRight: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});

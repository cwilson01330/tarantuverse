import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useUnreadMessages } from '../../src/hooks/useUnreadMessages';
import { NotificationBell } from '../../src/components/NotificationBell';

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
              pointerEvents="none"
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            />
          ) : (
            <View
              pointerEvents="none"
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 4 }}>
              <NotificationBell color={tintColor} size={26} />
              <TouchableOpacity
                onPress={() => router.push('/messages' as any)}
                style={styles.headerButton}
                accessibilityLabel={
                  unreadCount > 0
                    ? `Messages — ${unreadCount} unread`
                    : 'Messages'
                }
              >
                <MaterialCommunityIcons name="message-outline" size={26} color={tintColor} />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          // Single Collection tab spans every taxon (tarantulas +
          // scorpions today, more invert taxa later). Mirrors HV's
          // ADR-003 pattern: one bottom-bar entry, taxon disambiguates
          // inside the add flow. Header icon opens the unified species
          // browser — keepers can browse both catalogs from one place.
          title: 'My Collection',
          tabBarLabel: 'Collection',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="paw" size={size} color={color} />
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/species' as any)}
              style={styles.headerButton}
              accessibilityLabel="Browse species catalog"
            >
              <MaterialCommunityIcons
                name="book-open-variant"
                size={24}
                color={tintColor}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="scorpions"
        options={{
          // Hidden from the tab bar — the Collection tab now surfaces
          // both tarantulas and scorpions. Kept as a route so any
          // existing deep-links continue to resolve; the screen itself
          // could be deprecated to a redirect in a follow-up.
          href: null,
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
          // Hidden from the bottom bar to make room for the Scorpions
          // tab (iOS guideline is 5 tabs max; we'd have hit 6). Search
          // is still reachable via direct navigation from headers and
          // from screens that include a search affordance.
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    marginRight: 12,
    padding: 6,
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

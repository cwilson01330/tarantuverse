import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/contexts/ThemeContext';

// The message bell / unread badge moved into the dashboard's own gradient
// header (see app/(tabs)/index.tsx), which is why this file no longer
// imports NotificationBell or useUnreadMessages.
export default function TabLayout() {
  const { colors, layout } = useTheme();
  const router = useRouter();

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
          title: 'Home',
          tabBarLabel: 'Home',
          // The dashboard renders its own gradient header (greeting +
          // "{n} animals · {m} species" + actions). Those counts live in
          // the screen's state, so the header has to live there too —
          // otherwise the navigator would need a duplicate fetch.
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant" size={size} color={color} />
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
      {/* Declaration order below IS the bottom-bar order, so species is
          declared before community to land on the handoff's spine:
          Home · Collection · Species · Community · You. */}
      <Tabs.Screen
        name="species"
        options={{
          // Promoted to a real tab. The care-sheet catalog is the main
          // reason non-keepers open the app, and it was previously only
          // reachable via a header icon on the Collection tab.
          title: 'Species',
          tabBarLabel: 'Species',
          // The screen draws its own "Species Database" header inside a
          // SafeAreaView, so the navigator must not stack a second one.
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />
          ),
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
          // "You" rather than "Settings" — this tab is the profile hub
          // (achievements, subscription, collection stats), not just prefs.
          title: 'You',
          tabBarLabel: 'You',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color} />
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
});

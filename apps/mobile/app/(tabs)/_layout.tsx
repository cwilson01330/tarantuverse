import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#9ca3af',
        headerStyle: {
          backgroundColor: '#7c3aed',
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
          title: 'My Tarantulas',
          tabBarLabel: 'Collection',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="spider" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="species"
        options={{
          title: 'Species Database',
          tabBarLabel: 'Species',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />
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

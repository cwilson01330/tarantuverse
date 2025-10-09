import { View, Text, StyleSheet } from 'react-native';

export default function SpeciesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>📚 Species Database</Text>
      <Text style={styles.subtitle}>Coming soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#e5e7eb',
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
  },
});

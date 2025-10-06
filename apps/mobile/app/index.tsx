import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'

export default function Home() {
  const router = useRouter()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🕷️ Tarantuverse</Text>
      <Text style={styles.subtitle}>
        The ultimate tarantula husbandry tracking platform
      </Text>

      <View style={styles.buttonContainer}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.primaryButtonText}>Login</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push('/register')}
        >
          <Text style={styles.secondaryButtonText}>Register</Text>
        </Pressable>
      </View>

      <Text style={styles.features}>
        Track feedings • Log molts • Manage breeding • Connect with keepers
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 64,
  },
  primaryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
  features: {
    fontSize: 14,
    color: '#999',
  },
})

import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function SpeciesScreen() {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📚 Species Database</Text>
      <Text style={styles.subtitle}>Coming soon!</Text>
    </View>
  );
}

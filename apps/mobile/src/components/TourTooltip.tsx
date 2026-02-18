import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useCopilot } from 'react-native-copilot';

export default function TourTooltip() {
  const { colors } = useTheme();
  const {
    currentStep,
    isFirstStep,
    isLastStep,
    goToNext,
    goToPrev,
    stop,
    currentStepNumber,
    totalStepsNumber,
  } = useCopilot();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 300,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 8,
    },
    body: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 12,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 16,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dotActive: {
      backgroundColor: colors.primary,
    },
    dotInactive: {
      backgroundColor: colors.border,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skipButton: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    skipText: {
      fontSize: 14,
      color: colors.textTertiary,
      textDecorationLine: 'underline',
    },
    buttons: {
      flexDirection: 'row',
      gap: 8,
    },
    backButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    backText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    nextButton: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 12,
      overflow: 'hidden',
    },
    nextText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },
  });

  return (
    <View style={styles.container}>
      {currentStep?.name && (
        <Text style={styles.title}>{currentStep.name}</Text>
      )}
      <Text style={styles.body}>{currentStep?.text}</Text>

      {/* Step dots */}
      <View style={styles.dots}>
        {Array.from({ length: totalStepsNumber }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i + 1 === currentStepNumber ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity onPress={stop} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip tour</Text>
        </TouchableOpacity>

        <View style={styles.buttons}>
          {!isFirstStep && (
            <TouchableOpacity onPress={goToPrev} style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={isLastStep ? stop : goToNext} activeOpacity={0.8}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.nextButton}
            >
              <Text style={styles.nextText}>
                {isLastStep ? 'Done' : 'Next'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

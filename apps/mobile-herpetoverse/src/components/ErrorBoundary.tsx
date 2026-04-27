/**
 * ErrorBoundary — React render-error catchall for Herpetoverse mobile.
 *
 * Direct port of apps/mobile/src/components/ErrorBoundary.tsx. The only
 * Herpetoverse-specific bit is the import path for captureEvent — both
 * apps emit `$exception` events into the same PostHog project (segmented
 * by `app: 'herpetoverse-mobile'` vs `'tarantuverse-mobile'`), so error
 * rates can be compared across the two apps in one dashboard.
 *
 * If we ever spin up a `packages/` workspace, this is a strong candidate
 * to share between both mobile apps.
 */
import React, { Component, ComponentType, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { captureEvent } from '../services/posthog';

interface Props {
  scope?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      captureEvent('$exception', {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace: error.stack,
        $exception_component_stack: info.componentStack,
        scope: this.props.scope ?? 'unknown',
        source: 'react-error-boundary',
      });
    } catch {
      // Never let telemetry cause a secondary crash.
    }
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.scope ?? 'unknown'}]`, error, info);
  }

  handleReset = () => {
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
          scope={this.props.scope}
        />
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

function ErrorFallback({
  error,
  onReset,
  scope,
}: {
  error: Error;
  onReset: () => void;
  scope?: string;
}) {
  // Hardcoded colors — if the Theme provider itself crashes, the fallback
  // must still render. Using the Herpetoverse green primary instead of
  // Tarantuverse's brown.
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="snake" size={40} color="#fff" />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          {scope
            ? `We hit an unexpected error on the ${scope} screen.`
            : 'We hit an unexpected error.'}
          {' '}Tap Try again to reload just this screen.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel="Try loading this screen again"
        >
          <MaterialCommunityIcons name="refresh" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Try again</Text>
        </TouchableOpacity>
        <View style={styles.detailsBox}>
          <Text style={styles.detailsLabel}>Technical details</Text>
          <Text style={styles.detailsText} numberOfLines={6}>
            {error.name}: {error.message}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

export function withErrorBoundary<P extends object>(
  Component: ComponentType<P>,
  scope?: string,
): ComponentType<P> {
  const Wrapped = (props: P) => (
    <ErrorBoundary scope={scope}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Wrapped;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#16a34a', // Herpetoverse green primary
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 320,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    marginBottom: 24,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  detailsBox: {
    width: '100%',
    maxWidth: 400,
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailsText: { fontSize: 12, color: '#374151', fontFamily: 'monospace' },
});

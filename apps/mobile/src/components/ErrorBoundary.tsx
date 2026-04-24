/**
 * ErrorBoundary — React render-error catchall for mobile screens.
 *
 * Without this, any uncaught throw inside a tab screen's render (e.g. a
 * response shape that doesn't match what the component expects) crashes
 * the entire app to a blank screen. This boundary:
 *
 *   1. Shows a themed fallback with a "Try again" button that resets the
 *      boundary's state and re-mounts the subtree.
 *   2. Logs the error to PostHog under the `$exception` event so we can
 *      see crash rates per screen across the fleet.
 *   3. Accepts a `scope` prop so we tag errors by tab ("collection",
 *      "community", etc.) for filtering in PostHog.
 *
 * Use via the `withErrorBoundary(Screen, 'scope-name')` HOC so adding
 * coverage to a screen is a one-line change at the default-export site.
 */
import React, { Component, ComponentType, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { captureEvent } from '../services/posthog';

interface Props {
  /** Short tag like 'collection' — shows up in PostHog and the fallback subtitle. */
  scope?: string;
  /** Render-children. */
  children: ReactNode;
}

interface State {
  /** The caught error, or null while everything is fine. */
  error: Error | null;
  /** Bumped on every reset so React remounts the subtree cleanly. */
  resetKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // React calls this on the way down; return state that flips us into
    // fallback mode for the rest of the commit.
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // PostHog doesn't have a first-class exception method on the RN SDK,
    // so we emit a custom event with the standard `$exception`-style
    // property names and rely on PostHog's web UI to render them.
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

    // Always log to console too — useful in development and in the
    // remote logs of EAS builds if crash reports are captured there.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.scope ?? 'unknown'}]`, error, info);
  }

  handleReset = () => {
    // Clearing `error` drops the fallback; bumping `resetKey` forces the
    // child subtree to unmount and remount so any stale state inside it
    // (half-loaded data, broken refs) is thrown away.
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} scope={this.props.scope} />;
    }
    // key on the subtree so reset triggers a full remount, not just a re-render.
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
  // Can't use the Theme context hook here reliably — if the crash is in
  // the theme provider itself (has happened in dev), the hook would
  // throw again and mask the original error. Hard-code accessible
  // colors that work in both light and dark.
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="spider-web" size={40} color="#fff" />
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

/**
 * HOC — wrap a screen component with an ErrorBoundary. Makes adoption
 * a one-line change at the export site:
 *
 *   export default withErrorBoundary(CollectionScreen, 'collection');
 */
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
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#8B4513',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
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
    backgroundColor: '#8B4513',
    marginBottom: 24,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
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
  detailsText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'monospace',
  },
});

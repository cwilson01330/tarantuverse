import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppHeader } from '../src/components/AppHeader';
import { apiClient } from '../src/services/api';
import { useTheme } from '../src/contexts/ThemeContext';
import {
  getGoogleIdentity,
  getAppleIdentity,
  isGoogleSignInAvailable,
} from '../src/services/google-signin';

interface LinkedAccount {
  id: string;
  provider: string;
  provider_email: string | null;
  provider_name: string | null;
  provider_avatar: string | null;
  created_at: string | null;
}

type ProviderKey = 'google' | 'apple';

interface ProviderMeta {
  key: ProviderKey;
  label: string;
  icon: 'google' | 'apple';
  available: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  { key: 'google', label: 'Google', icon: 'google', available: isGoogleSignInAvailable },
  // Apple Sign-In is iOS-only.
  { key: 'apple', label: 'Apple', icon: 'apple', available: Platform.OS === 'ios' },
];

function isCancellation(e: any): boolean {
  const code = e?.code || '';
  const msg = (e?.message || '').toLowerCase();
  return (
    code === 'ERR_CANCELED' ||
    code === 'ERR_REQUEST_CANCELED' ||
    code === 'SIGN_IN_CANCELLED' ||
    code === '-5' ||
    msg.includes('cancel')
  );
}

export default function LinkedAccountsScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<ProviderKey | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiClient.get<LinkedAccount[]>('/auth/linked-accounts');
      setAccounts(res.data ?? []);
      setLoadError('');
    } catch (e: any) {
      if (e?.response?.status === 401) return;
      setLoadError(e?.response?.data?.detail || e?.message || 'Failed to load sign-in methods');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [fetchAccounts])
  );

  const linkedFor = (key: ProviderKey) => accounts.find((a) => a.provider === key) || null;

  const handleAdd = async (key: ProviderKey) => {
    setBusy(key);
    try {
      const identity = key === 'google' ? await getGoogleIdentity() : await getAppleIdentity();
      await apiClient.post('/auth/link-account-direct', {
        provider: identity.provider,
        id: identity.id,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
      });
      await fetchAccounts();
      Alert.alert('Linked', `You can now sign in with ${key === 'google' ? 'Google' : 'Apple'}.`);
    } catch (e: any) {
      if (isCancellation(e)) return;
      Alert.alert(
        'Could not link',
        e?.response?.data?.detail || e?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = (key: ProviderKey) => {
    const label = key === 'google' ? 'Google' : 'Apple';
    Alert.alert(
      `Remove ${label} sign-in?`,
      `You'll no longer be able to sign in with ${label}. You can add it back anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(key);
            try {
              await apiClient.delete(`/auth/unlink-account/${key}`);
              await fetchAccounts();
            } catch (e: any) {
              Alert.alert(
                'Could not remove',
                e?.response?.data?.detail ||
                  e?.message ||
                  'Something went wrong. Please try again.'
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const backAction = (
    <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back" style={{ paddingRight: 4 }}>
      <MaterialCommunityIcons name="arrow-left" size={26} color={iconColor} />
    </TouchableOpacity>
  );

  const visibleProviders = PROVIDERS.filter((p) => p.available || linkedFor(p.key));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Sign-in methods" subtitle="Choose how you log in" leftAction={backAction} />

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Link more than one sign-in to this account so you can use whichever you like — they all
          open the same collection.
        </Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : loadError !== '' ? (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: colors.error ?? '#ef4444' },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.error ?? '#b91c1c' }]}>{loadError}</Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                setLoadError('');
                fetchAccounts();
              }}
            >
              <Text style={[styles.retryText, { color: colors.error ?? '#b91c1c' }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.md },
            ]}
          >
            {visibleProviders.map((p, idx) => {
              const linked = linkedFor(p.key);
              const isBusy = busy === p.key;
              return (
                <View
                  key={p.key}
                  style={[
                    styles.row,
                    {
                      borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons name={p.icon} size={26} color={colors.textPrimary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.provLabel, { color: colors.textPrimary }]}>{p.label}</Text>
                    <Text
                      style={[styles.provSub, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {linked
                        ? linked.provider_email || 'Linked'
                        : 'Not linked'}
                    </Text>
                  </View>
                  {isBusy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : linked ? (
                    <TouchableOpacity
                      onPress={() => handleRemove(p.key)}
                      accessibilityLabel={`Remove ${p.label} sign-in`}
                      style={[styles.actionBtn, { borderColor: colors.error ?? '#ef4444', borderRadius: layout.radius.sm }]}
                    >
                      <Text style={[styles.actionText, { color: colors.error ?? '#dc2626' }]}>Remove</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleAdd(p.key)}
                      accessibilityLabel={`Add ${p.label} sign-in`}
                      style={[styles.actionBtn, { borderColor: colors.primary, borderRadius: layout.radius.sm }]}
                    >
                      <Text style={[styles.actionText, { color: colors.primary }]}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <Text style={[styles.footnote, { color: colors.textTertiary }]}>
          You need to keep at least one sign-in method (or a password) on your account.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  errorCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  errorText: { flex: 1, fontSize: 14 },
  retryText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  card: { borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  provLabel: { fontSize: 16, fontWeight: '600' },
  provSub: { fontSize: 12, marginTop: 2 },
  actionBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionText: { fontSize: 14, fontWeight: '700' },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: 16 },
});

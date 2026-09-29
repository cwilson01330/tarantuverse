/**
 * Sharing — co-keepers (PRD-shared-keeping rung 3).
 *
 *  - Shared with me: collections you help keep, and invites waiting for you.
 *  - Your co-keepers: people who help keep YOUR collection (premium to invite).
 *
 * Mirrors the web /dashboard/sharing page. Every button is a hint; the API
 * enforces every rule on every request.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppHeader } from '../../src/components/AppHeader';
import SitterButton from '../../src/components/SitterButton';
import UpgradeModal from '../../src/components/UpgradeModal';
import { withErrorBoundary } from '../../src/components/ErrorBoundary';
import { TYPE } from '../../src/theme/tokens';
import {
  MEMBER_APP, ROLES, ROLE_HELP, ROLE_LABEL, coKeeperApi, coKeeperErrorMessage, loadSharedWithMe,
  type InviteCreated, type Member, type Role, type SharedWithMe,
} from '../../src/lib/co-keepers';

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function SharingScreen() {
  const { colors, layout } = useTheme();
  const { user } = useAuth();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;
  const [shared, setShared] = useState<SharedWithMe | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const [justInvited, setJustInvited] = useState<InviteCreated | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('logger');
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([loadSharedWithMe(true, user?.id ?? null), coKeeperApi.members()]);
      setShared(s);
      setMembers(m);
    } catch (e) {
      setMembers((prev) => prev ?? []);
      Alert.alert('Could not load sharing', coKeeperErrorMessage(e));
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e: any) {
      if (e?.response?.status === 402) setUpgrade(coKeeperErrorMessage(e));
      else Alert.alert('Something went wrong', coKeeperErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const invite = () => {
    const v = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return Alert.alert('Check the email', 'Enter a valid email address.');
    if (user?.email && v === user.email.trim().toLowerCase()) return Alert.alert('Check the email', "That's your own email address.");
    void run('invite', async () => {
      setJustInvited(await coKeeperApi.invite(v, role));
      setEmail('');
    });
  };

  const pickRole = (m: Member) =>
    Alert.alert(`Role for ${m.status === 'active' ? (m.member?.name ?? 'this person') : m.invited_email}`, undefined, [
      ...ROLES.map((r) => ({
        text: `${ROLE_LABEL[r]}${r === m.role ? ' ✓' : ''}`,
        onPress: () => { if (r !== m.role) void run('role', async () => { await coKeeperApi.changeRole(m.id, r); }); },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const remove = (m: Member) => {
    const who = m.status === 'active' ? (m.member?.name ?? 'this person') : m.invited_email;
    Alert.alert(m.status === 'active' ? `Remove ${who}?` : `Cancel the invite to ${who}?`,
      m.status === 'active' ? 'They lose access straight away.' : undefined, [
        { text: 'Keep', style: 'cancel' },
        { text: m.status === 'active' ? 'Remove' : 'Cancel invite', style: 'destructive',
          onPress: () => run('remove', async () => { await coKeeperApi.remove(m.id); }) },
      ]);
  };

  const invites = shared?.invites.filter((i) => i.app === MEMBER_APP) ?? [];
  const collections = shared?.collections.filter((c) => c.app === MEMBER_APP) ?? [];
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: layout.radius.lg }];
  const input = [TYPE.body, styles.input, { color: colors.textPrimary, borderColor: colors.border, borderRadius: layout.radius.md, backgroundColor: colors.background }];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Sharing"
        leftAction={
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={28} color={iconColor} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={[TYPE.body, { color: colors.textSecondary }]}>
          Keep a collection together. Everyone uses their own account, and you choose what each person can do.
        </Text>

        <TouchableOpacity onPress={() => router.push('/share/cards' as never)} accessibilityRole="button" accessibilityLabel="Shared cards"
          style={[...card, styles.linkRow]}>
          <View style={styles.flexBtn}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Shared cards</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Links you made to share a card. Turn any off.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* ── Shared with me ── */}
        <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>Shared with me</Text>
        {shared === null && members === null && <ActivityIndicator color={colors.primary} />}
        {shared && !shared.email_verified && (
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>Verify your email address to see and accept invites sent to it.</Text>
        )}
        {invites.map((inv) => (
          <View key={inv.id} style={[...card, { borderColor: colors.primary }]}>
            <Text style={[TYPE.body, { color: colors.textPrimary }]}>
              <Text style={TYPE.bodyStrong}>{inv.owner.name}</Text> invited you to help keep their collection as a{' '}
              <Text style={TYPE.bodyStrong}>{ROLE_LABEL[inv.role]}</Text>.
            </Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{ROLE_HELP[inv.role]}</Text>
            <View style={styles.row}>
              <View style={styles.flexBtn}>
                <SitterButton label="Accept" busy={busy === 'accept'} disabled={!!busy}
                  onPress={() => run('accept', async () => { await coKeeperApi.acceptInvite(inv.id); })} />
              </View>
              <View style={styles.flexBtn}>
                <SitterButton label="Decline" variant="secondary" disabled={!!busy}
                  onPress={() => run('decline', async () => { await coKeeperApi.declineInvite(inv.id); })} />
              </View>
            </View>
          </View>
        ))}
        {shared && collections.length === 0 && invites.length === 0 && (
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>Nothing shared with you yet. Invited by someone? Open the link in the invite email, or enter the code from it below.</Text>
        )}
        {collections.map((c) => (
          <View key={c.membership_id} style={card}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>{c.owner.name}&apos;s collection</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
              You&apos;re a {ROLE_LABEL[c.role]}{c.read_only ? ' · read-only for now' : ''}
            </Text>
            <View style={styles.row}>
              <View style={styles.flexBtn}>
                <SitterButton label="Open" onPress={() => router.push({ pathname: '/shared/[ownerId]', params: { ownerId: c.owner.id } } as never)} />
              </View>
              <View style={styles.flexBtn}>
                <SitterButton label="Leave" variant="secondary" disabled={!!busy}
                  onPress={() => Alert.alert(`Leave ${c.owner.name}'s collection?`, "You'll need a new invite to come back.", [
                    { text: 'Stay', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => run('leave', async () => { await coKeeperApi.leave(c.membership_id); }) },
                  ])} />
              </View>
            </View>
          </View>
        ))}

        {/* For invite emails whose links a mail filter blocked: type the code instead. */}
        <View style={card}>
          <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Have an invite code?</Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
            If the link in your invite email won&apos;t open, enter the code printed under it.
          </Text>
          <TextInput style={[...input, styles.code]} value={code} onChangeText={setCode} placeholder="XXXXX-XXXXX"
            placeholderTextColor={colors.textTertiary} autoCapitalize="characters" autoCorrect={false}
            maxLength={20} accessibilityLabel="Invite code" />
          <SitterButton label="Accept code" busy={busy === 'code'} disabled={!!busy}
            onPress={() => {
              if (code.replace(/[^a-z0-9]/gi, '').length < 10) {
                Alert.alert('Check the code', 'Enter the 10-character code from your invite email.');
                return;
              }
              void run('code', async () => {
                const joined = await coKeeperApi.acceptCode(code);
                setCode('');
                Alert.alert("You're in", `You joined ${joined.owner.name}'s collection.`, [
                  { text: 'Later', style: 'cancel' },
                  { text: 'Open it', onPress: () => router.push({ pathname: '/shared/[ownerId]', params: { ownerId: joined.owner.id } } as never) },
                ]);
              });
            }} />
        </View>

        {/* ── Your co-keepers ── */}
        <Text style={[TYPE.heading, styles.h, { color: colors.textPrimary }]}>Your co-keepers</Text>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
          People who help keep your collection. Up to 10. Only you can delete or transfer animals, export, or change who has access.
        </Text>
        {members?.length === 0 && <Text style={[TYPE.body, { color: colors.textSecondary }]}>No co-keepers yet.</Text>}
        {members?.map((m) => (
          <View key={m.id} style={card}>
            <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>
              {m.status === 'active' ? (m.member?.name ?? 'Former member') : m.invited_email}
            </Text>
            <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
              {ROLE_LABEL[m.role]} · {m.status === 'active' ? `Joined ${fmt(m.accepted_at)}` : `Invited · link works until ${fmt(m.invite_expires_at)}`}
            </Text>
            <View style={styles.row}>
              <View style={styles.flexBtn}>
                <SitterButton label="Change role" variant="secondary" disabled={!!busy} onPress={() => pickRole(m)} />
              </View>
              {m.status === 'pending' && (
                <View style={styles.flexBtn}>
                  <SitterButton label="Resend" variant="secondary" disabled={!!busy}
                    onPress={() => run('resend', async () => { setJustInvited(await coKeeperApi.resend(m.id)); })} />
                </View>
              )}
              <View style={styles.flexBtn}>
                <SitterButton label={m.status === 'active' ? 'Remove' : 'Cancel'} variant="danger" disabled={!!busy} onPress={() => remove(m)} />
              </View>
            </View>
          </View>
        ))}

        {justInvited && (
          <View style={card} accessibilityLiveRegion="polite">
            <Text style={[TYPE.body, { color: colors.textPrimary }]}>
              {justInvited.email_sent
                ? `Invite sent to ${justInvited.invited_email}.`
                : `We couldn't email ${justInvited.invited_email} — send them the link instead.`}
            </Text>
            <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
              It only works for an account verified with that email address.
            </Text>
            <Text style={[TYPE.body, { color: colors.textPrimary }]} selectable>
              Invite code: <Text style={[TYPE.bodyStrong, styles.codeText]}>{justInvited.invite_code}</Text>
            </Text>
            <View style={styles.row}>
              <View style={styles.flexBtn}>
                <SitterButton label="Share link" variant="secondary"
                  onPress={() => { void Share.share({ message: `Help me keep my collection on Tarantuverse: ${justInvited.accept_url}\n\nIf the link won't open, enter this code on the Sharing screen: ${justInvited.invite_code}` }); }} />
              </View>
              <View style={styles.flexBtn}>
                <SitterButton label="Done" variant="secondary" onPress={() => setJustInvited(null)} />
              </View>
            </View>
          </View>
        )}

        <View style={card}>
          <Text style={[TYPE.subheading, { color: colors.textPrimary }]}>Invite someone</Text>
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Premium</Text>
          <TextInput style={input} value={email} onChangeText={setEmail} placeholder="name@example.com"
            placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} accessibilityLabel="Their email" />
          <View style={styles.chips} accessibilityRole="radiogroup">
            {ROLES.map((r) => {
              const on = r === role;
              return (
                <TouchableOpacity key={r} onPress={() => setRole(r)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent', borderRadius: layout.radius.md }]}>
                  <Text style={[TYPE.bodyStrong, { color: on ? '#fff' : colors.textPrimary }]}>{ROLE_LABEL[r]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{ROLE_HELP[role]}</Text>
          <SitterButton label="Send invite" busy={busy === 'invite'} disabled={!!busy} onPress={invite} />
        </View>
      </ScrollView>

      <UpgradeModal
        visible={upgrade !== null}
        onClose={() => setUpgrade(null)}
        source="shared_keeping"
        title="Co-keepers"
        message={upgrade ?? ''}
        feature="Share your collection with co-keepers"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  h: { marginTop: 12 },
  card: { borderWidth: 1, padding: 14, gap: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexBtn: { flex: 1 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  code: { letterSpacing: 3 },
  codeText: { letterSpacing: 2 },
});

export default withErrorBoundary(SharingScreen, 'sharing');

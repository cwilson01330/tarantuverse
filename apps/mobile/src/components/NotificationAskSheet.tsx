/**
 * NotificationAskSheet - the ONLY place (besides Settings > Enable) where the
 * keeper is asked for notification permission (Day-one, 2026-10-27).
 *
 * The OS dialog is never shown at login or on app start. Instead two one-time,
 * in-app asks run at moments the keeper chose:
 *   - 'after_save': right after they saved an animal ("Want a heads-up when
 *     {name} is due to eat?")
 *   - 'due':        when something is due ("Want a reminder on days something
 *     is due?")
 * "Turn on reminders" is what triggers the system dialog; "Not now" just closes.
 * The rules for WHEN to ask live in src/lib/notification-ask.ts (pure, jest);
 * copy lives in src/lib/first-feeding.ts.
 *
 * Usage (a screen renders the sheet once and drives it through the hook):
 *
 *   const ask = useNotificationAsk()
 *   ...
 *   if (await ask.maybeAskAfterSave(name)) { // resolves after the sheet closed
 *     ...
 *   }
 *   ask.maybeAskWhenDue(anyDue)
 *   ...
 *   <NotificationAskSheet {...ask.sheetProps} />
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { FIRST_FEEDING_COPY } from '../lib/first-feeding';
import {
  ASK_STORAGE_KEY,
  parseAskState,
  shouldAskAfterSave,
  shouldAskWhenDue,
  type AskState,
} from '../lib/notification-ask';
import { getPermissionStatus, registerPushToken, requestNotificationPermissions } from '../services/notifications';
import { SPACING, TYPE } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';

export type AskVariant = 'after_save' | 'due';

export interface NotificationAskSheetProps {
  visible: boolean;
  variant: AskVariant;
  /** Used by the 'after_save' title; falls back to "your animal". */
  animalName?: string;
  /** enabled = the OS permission is now granted. Called for both buttons and for a dismissal. */
  onDone: (enabled: boolean) => void;
}

/** Roughly how long the Modal's slide-out takes; navigating before it ends can glitch on iOS. */
const MODAL_CLOSE_MS = 300;

async function readState(): Promise<AskState> {
  try {
    return parseAskState(await AsyncStorage.getItem(ASK_STORAGE_KEY));
  } catch {
    return parseAskState(null);
  }
}

/** Persist that this ask has been shown (merging with what is stored). Never throws. */
async function markShown(variant: AskVariant): Promise<void> {
  try {
    const stored = await readState();
    const next: AskState =
      variant === 'after_save' ? { ...stored, afterSaveShown: true } : { ...stored, dueShown: true };
    await AsyncStorage.setItem(ASK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A failed write at worst means the keeper is asked once more.
  }
}

/** The keeper answered the OS dialog without granting: never ask again, from either place. Never throws. */
async function markRefused(): Promise<void> {
  try {
    const next: AskState = { afterSaveShown: true, dueShown: true };
    await AsyncStorage.setItem(ASK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Worst case the keeper is asked once more.
  }
}

export function NotificationAskSheet({ visible, variant, animalName, onDone }: NotificationAskSheetProps) {
  const { colors, layout } = useTheme();
  const [busy, setBusy] = useState(false);

  // Writing the "shown" flag happens when the sheet becomes visible, so a
  // force-quit with the sheet open still counts as having asked.
  useEffect(() => {
    if (visible) {
      setBusy(false);
      void markShown(variant);
    }
  }, [visible, variant]);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    let enabled = false;
    try {
      enabled = await requestNotificationPermissions();
      // Token registration is best effort; AuthContext retries on every launch.
      if (enabled) await registerPushToken();
    } catch {
      enabled = false;
    }
    // The OS dialog is spent (Android 13+ still reports canAskAgain after one
    // refusal), so neither ask may run again: record both as shown.
    if (!enabled) await markRefused();
    setBusy(false);
    onDone(enabled);
  };

  const decline = () => {
    if (busy) return;
    onDone(false);
  };

  const title =
    variant === 'after_save'
      ? FIRST_FEEDING_COPY.pushAskAfterSaveTitle(animalName?.trim() || 'your animal')
      : FIRST_FEEDING_COPY.pushAskWhenDueTitle;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={decline}>
      {/* Not accessible: a labelled wrapper would hide the sheet's own controls from screen readers. */}
      <Pressable style={styles.backdrop} onPress={decline} accessible={false}>
        <Pressable
          accessible={false}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: layout.radius.lg,
              borderTopRightRadius: layout.radius.lg,
            },
          ]}
        >
          <SafeAreaView edges={['bottom']}>
            <Text style={[TYPE.heading, { color: colors.textPrimary }]} accessibilityRole="header">
              {title}
            </Text>
            <Text style={[TYPE.body, styles.body, { color: colors.textSecondary }]}>
              {FIRST_FEEDING_COPY.pushAskBody}
            </Text>

            <View style={styles.actions}>
              <PrimaryButton
                onPress={accept}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={FIRST_FEEDING_COPY.pushAskAccept}
                style={[styles.primaryInner, { borderRadius: layout.radius.md }]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[TYPE.subheadingBold, styles.primaryText]}>{FIRST_FEEDING_COPY.pushAskAccept}</Text>
                )}
              </PrimaryButton>

              <TouchableOpacity
                onPress={decline}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={FIRST_FEEDING_COPY.pushAskDecline}
                style={[styles.secondary, { borderColor: colors.border, borderRadius: layout.radius.md, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>{FIRST_FEEDING_COPY.pushAskDecline}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Owns the ask state and the sheet's props. Both asks are one-time and
 * independent (see notification-ask.ts); only one sheet is ever open at once.
 */
export function useNotificationAsk() {
  const [state, setState] = useState<AskState>({ afterSaveShown: false, dueShown: false });
  const [sheet, setSheet] = useState<{ visible: boolean; variant: AskVariant; animalName?: string }>({
    visible: false,
    variant: 'after_save',
  });

  const stateRef = useRef<AskState>(state);
  /** True from the moment a sheet is chosen until it has finished closing. */
  const openRef = useRef(false);
  const resolveRef = useRef<((shown: boolean) => void) | null>(null);
  const mountedRef = useRef(true);

  // Re-read on every call (no caching): a refusal or "shown" flag written by the
  // sheet on another screen must be seen here.
  const load = useCallback(async (): Promise<AskState> => {
    const s = await readState();
    stateRef.current = s;
    if (mountedRef.current) setState(s);
    return s;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      // Never leave a caller awaiting a sheet that can no longer close.
      // Resolve false: the screen is gone, so the caller must not navigate from it.
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, [load]);

  /** Show a sheet if nothing else is showing; `wait` resolves once it has closed. */
  const open = useCallback(
    (variant: AskVariant, animalName: string | undefined, wait: boolean): Promise<boolean> => {
      openRef.current = true;
      const next: AskState =
        variant === 'after_save'
          ? { ...stateRef.current, afterSaveShown: true }
          : { ...stateRef.current, dueShown: true };
      stateRef.current = next;
      setState(next);
      setSheet({ visible: true, variant, animalName });
      if (!wait) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [],
  );

  const maybeAskAfterSave = useCallback(
    async (name: string): Promise<boolean> => {
      if (openRef.current) return false;
      await load();
      if (openRef.current) return false;
      const p = await getPermissionStatus();
      // Re-check: another ask may have claimed the sheet while we awaited.
      if (openRef.current || !shouldAskAfterSave(stateRef.current, p)) return false;
      return open('after_save', name, true);
    },
    [load, open],
  );

  const maybeAskWhenDue = useCallback(
    (anyDue: boolean): void => {
      if (!anyDue || openRef.current) return;
      void (async () => {
        await load();
        if (openRef.current) return;
        const p = await getPermissionStatus();
        if (openRef.current || !shouldAskWhenDue(stateRef.current, p, anyDue)) return;
        void open('due', undefined, false);
      })();
    },
    [load, open],
  );

  const onDone = useCallback((_enabled: boolean) => {
    setSheet((cur) => ({ ...cur, visible: false }));
    // Hold the "open" claim and the caller's promise until the slide-out ends.
    setTimeout(() => {
      openRef.current = false;
      const resolve = resolveRef.current;
      resolveRef.current = null;
      resolve?.(true);
    }, MODAL_CLOSE_MS);
  }, []);

  return {
    state,
    maybeAskAfterSave,
    maybeAskWhenDue,
    sheetProps: {
      visible: sheet.visible,
      variant: sheet.variant,
      animalName: sheet.animalName,
      onDone,
    } satisfies NotificationAskSheetProps,
  };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  body: {
    marginTop: SPACING.sm,
  },
  actions: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  primaryInner: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
  },
  secondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});

export default NotificationAskSheet;

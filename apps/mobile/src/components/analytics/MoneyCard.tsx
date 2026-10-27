import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { SPACING, TYPE } from '../../theme/tokens';
import { ADD_PAID_LINK, formatMoney, moneyCard, type AdvancedAnalytics } from '../../lib/analytics-view';
import { AnalyticsCard, CardHeading, Figure, Hairline, LinkRow, MIN_TOUCH, OutlineButton, ON_PRIMARY } from './parts';

/** What the API charges per feeding when the keeper has not set their own. */
const DEFAULT_COST = 0.5;

export type MoneyCardProps =
  /** The real card; Change saves through `onSaveCost` (the page then refetches /advanced/ only). */
  | { mode: 'member'; data: AdvancedAnalytics; onSaveCost: (value: number | null) => Promise<void> }
  /** A free keeper behind the preview: only what was paid in total. */
  | { mode: 'preview'; paid: { paid: string; caption: string } }
  /** The grey sample figures; nothing editable. */
  | { mode: 'sample'; data: AdvancedAnalytics };

/**
 * Money (Premium): spent this month, paid for animals, and the estimated feeding
 * cost with its Change control. Plain numbers in the keeper's own currency, no
 * symbol. The cost-per-feeding editor moved here from the old Advanced screen
 * with the same validation (0-1000, comma or point), messages, "Use default" and
 * save-then-refetch behaviour; the "$" prefix and "($0.50)" are gone because the
 * page never prints a currency symbol.
 */
export function MoneyCard(props: MoneyCardProps) {
  const { colors, layout } = useTheme();
  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);

  if (props.mode === 'preview') {
    return (
      <AnalyticsCard>
        <CardHeading icon="cash-multiple" title="Money" trailing="your currency · private" />
        <Figure value={props.paid.paid} caption={props.paid.caption} />
      </AnalyticsCard>
    );
  }

  const data = props.data;
  const model = moneyCard(data);
  const sample = props.mode === 'sample';
  const cost = data.cost_per_feeding ?? DEFAULT_COST;

  const save = async (value: number | null) => {
    if (props.mode !== 'member') return;
    setSavingCost(true);
    setCostError(null);
    try {
      await props.onSaveCost(value);
      setEditingCost(false);
    } catch {
      setCostError("Couldn't save that. Try again.");
    } finally {
      setSavingCost(false);
    }
  };

  const submit = () => {
    const n = Number(costDraft.replace(',', '.').replace(/[^0-9.]/g, ''));
    if (costDraft.trim() === '' || !Number.isFinite(n) || n < 0 || n > 1000) {
      setCostError('Enter an amount from 0 to 1000.');
      return;
    }
    void save(Math.round(n * 100) / 100);
  };

  return (
    <AnalyticsCard sample={sample}>
      <CardHeading icon="cash-multiple" title="Money" trailing={model.trailing} />

      <View style={styles.figures}>
        <Figure value={model.spent.value} caption={model.spent.caption} sub={model.spent.sub} muted={sample} />
        <View style={styles.paid}>
          <Figure value={model.paid.value} caption={model.paid.caption} sub={model.paid.sub} muted={sample} />
          {model.paid.addLink && !sample ? (
            <LinkRow label={ADD_PAID_LINK} onPress={() => router.push('/(tabs)/collection' as never)} />
          ) : null}
        </View>
      </View>

      <Hairline />

      <View style={styles.feedingRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.feedingLabel, { color: colors.textSecondary }]}>
            {model.feeding.label}{' '}
            <Text style={{ fontWeight: '700', color: sample ? colors.textTertiary : colors.textPrimary }}>
              {model.feeding.value}
            </Text>
          </Text>
          {model.feeding.caption ? (
            <Text style={[styles.feedingCaption, { color: colors.textTertiary }]}>{model.feeding.caption}</Text>
          ) : null}
        </View>
        {props.mode === 'member' && !editingCost ? (
          <OutlineButton
            label="Change"
            accessibilityLabel="Change cost per feeding"
            onPress={() => {
              setCostDraft(cost.toFixed(2));
              setCostError(null);
              setEditingCost(true);
            }}
          />
        ) : null}
      </View>

      {props.mode === 'member' && editingCost ? (
        <View style={{ gap: SPACING.sm }}>
          <Text style={[TYPE.label, { color: colors.textSecondary }]}>Cost per feeding</Text>
          <TextInput
            value={costDraft}
            onChangeText={setCostDraft}
            keyboardType="decimal-pad"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="Cost per feeding"
            style={[
              TYPE.body,
              {
                minWidth: 96,
                minHeight: MIN_TOUCH,
                alignSelf: 'flex-start',
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: layout.radius.sm,
                color: colors.textPrimary,
                backgroundColor: colors.surface,
              },
            ]}
          />
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
            What one meal costs you on average. 0 if you breed your own feeders.
          </Text>
          <View style={styles.editButtons}>
            <Pressable
              onPress={submit}
              disabled={savingCost}
              accessibilityRole="button"
              accessibilityLabel="Save cost per feeding"
              accessibilityState={{ disabled: savingCost, busy: savingCost }}
              style={[
                styles.saveButton,
                { backgroundColor: colors.primary, borderRadius: layout.radius.sm, opacity: savingCost ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.saveText, { color: ON_PRIMARY }]}>{savingCost ? 'Saving…' : 'Save'}</Text>
            </Pressable>
            <OutlineButton
              label="Cancel"
              onPress={() => {
                setEditingCost(false);
                setCostError(null);
              }}
            />
            {data.cost_per_feeding_is_default === false ? (
              <Pressable
                onPress={() => void save(null)}
                disabled={savingCost}
                accessibilityRole="button"
                style={styles.defaultButton}
              >
                <Text style={[TYPE.body, { color: colors.textSecondary }]}>
                  Use default ({formatMoney(DEFAULT_COST)})
                </Text>
              </Pressable>
            ) : null}
          </View>
          {costError ? (
            <Text style={[TYPE.caption, { color: colors.error }]} accessibilityLiveRegion="polite">
              {costError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </AnalyticsCard>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', columnGap: SPACING.xl },
  paid: { flexShrink: 1 },
  feedingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  feedingLabel: { ...TYPE.small },
  feedingCaption: { ...TYPE.micro },
  editButtons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
  saveButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { ...TYPE.smallBold },
  defaultButton: { minHeight: MIN_TOUCH, paddingHorizontal: SPACING.sm, justifyContent: 'center' },
});

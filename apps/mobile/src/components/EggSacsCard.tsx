/**
 * Egg sacs on an animal's detail screen: the mother's list of sacs (or
 * oothecae, broods), each with its status, tapping through to the sac.
 *
 * Shown to keepers only, for female / unknown-sex animals of taxa with the
 * eggSacs module. It stays visible when the animal is closed (a mother that
 * died after laying still has sacs to hatch); only "Log ..." is hidden then.
 * The parent fetches the list (once per detail load) and passes it in.
 */
import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppText, SectionCard } from './ui';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING } from '../theme/tokens';
import { sacStatus, sacStatusLabel } from '../lib/broods';
import { clutchSectionLabel, isLiveBirth } from '../lib/taxon-modules';
import { logSacLabel, showEggSacsCard, type EggSac } from '../lib/egg-sacs';
import { formatLocalDate } from '../utils/date';

interface Props {
  invert: { id: string; taxon: string; sex: string | null; name: string };
  canKeep: boolean;
  isClosed: boolean;
  /** null while loading or if the load failed. */
  sacs: EggSac[] | null;
}

export function EggSacsCard({ invert, canKeep, isClosed, sacs }: Props) {
  const { colors, layout } = useTheme();
  const router = useRouter();
  if (!showEggSacsCard(invert.taxon, invert.sex, canKeep)) return null;

  const live = isLiveBirth(invert.taxon);
  const logLabel = logSacLabel(invert.taxon);

  return (
    <SectionCard
      title={clutchSectionLabel(invert.taxon)}
      actionLabel={isClosed ? undefined : logLabel}
      onAction={isClosed ? undefined : () => router.push(`/invert/add-egg-sac?id=${invert.id}` as never)}
    >
      {sacs === null ? null : sacs.length === 0 ? (
        <AppText variant="body" color="textTertiary">
          {isClosed ? 'None recorded.' : `None yet. Tap "${logLabel}" when ${invert.name} lays one.`}
        </AppText>
      ) : (
        <View style={{ gap: SPACING.sm }}>
          {sacs.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => router.push(`/breeding/egg-sacs/${s.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${s.pairing_id ? '' : 'unpaired '}entry laid ${formatLocalDate(s.laid_date, { month: 'short', day: 'numeric', year: 'numeric' })}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACING.sm,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: layout.radius.md,
                padding: SPACING.md,
              }}
            >
              <MaterialCommunityIcons name="egg-easter" size={18} color={colors.textSecondary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {formatLocalDate(s.laid_date, { month: 'short', day: 'numeric', year: 'numeric' })}
                </AppText>
                <AppText variant="caption" color="textTertiary" numberOfLines={1}>
                  {sacStatusLabel(sacStatus(s), live)}
                  {s.pairing_id ? '' : ' · No pairing recorded'}
                </AppText>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

/**
 * MoltPhotoPrompt - offered once after a new molt is saved ("Want a photo of
 * the new look?"). Never forced: closing it just carries on. "Don't ask again"
 * is reported to every exit (Take, Choose, Not now, backdrop) as
 * `dontAskAgain`; the caller stores it.
 */
import React, { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { SPACING, TYPE } from '../theme/tokens'

export interface MoltPhotoPromptProps {
  visible: boolean
  onTake: (dontAskAgain: boolean) => void
  onChoose: (dontAskAgain: boolean) => void
  onClose: (dontAskAgain: boolean) => void
}

export function MoltPhotoPrompt({ visible, onTake, onChoose, onClose }: MoltPhotoPromptProps) {
  const { colors, layout } = useTheme()
  const [dontAsk, setDontAsk] = useState(false)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose(dontAsk)}>
      <Pressable style={styles.backdrop} onPress={() => onClose(dontAsk)} accessible={false}>
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
              Add a photo of the new molt?
            </Text>
            <Text style={[TYPE.body, styles.body, { color: colors.textSecondary }]}>
              A photo now makes the photo timeline show growth molt by molt.
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => onTake(dontAsk)}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                style={[styles.primary, { backgroundColor: colors.primary, borderRadius: layout.radius.md }]}
              >
                <MaterialCommunityIcons name="camera" size={18} color="#fff" />
                <Text style={[TYPE.subheadingBold, styles.primaryText]}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChoose(dontAsk)}
                accessibilityRole="button"
                accessibilityLabel="Choose photo"
                style={[styles.secondary, { borderColor: colors.border, borderRadius: layout.radius.md }]}
              >
                <MaterialCommunityIcons name="image-multiple" size={18} color={colors.textPrimary} />
                <Text style={[TYPE.bodyStrong, { color: colors.textPrimary }]}>Choose photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onClose(dontAsk)}
                accessibilityRole="button"
                accessibilityLabel="Not now"
                style={styles.tertiary}
              >
                <Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>Not now</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setDontAsk((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontAsk }}
              accessibilityLabel="Don't ask again"
              style={styles.checkRow}
            >
              <MaterialCommunityIcons
                name={dontAsk ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={dontAsk ? colors.primary : colors.textTertiary}
              />
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>Don't ask again</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { padding: SPACING.lg, borderWidth: 1 },
  body: { marginTop: SPACING.xs },
  actions: { marginTop: SPACING.lg, gap: SPACING.sm },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: 14 },
  primaryText: { color: '#fff' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: 13, borderWidth: 1 },
  tertiary: { alignItems: 'center', paddingVertical: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs, paddingVertical: 8 },
})

export default MoltPhotoPrompt

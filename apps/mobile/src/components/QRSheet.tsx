/**
 * QRSheet — bottom sheet shown from tarantula detail screen.
 * Two modes:
 *   upload  — generates a short-lived upload session QR for phone photo uploads
 *   profile — shows the permanent profile QR for enclosure labels / sharing
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Share,
  Alert,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'
import { apiClient } from '../services/api'

interface QRSheetProps {
  visible: boolean
  onClose: () => void
  tarantulaId: string
  tarantulaName: string
  scientificName?: string | null
  onPhotoAdded?: () => void
}

type Tab = 'upload' | 'profile'
type UploadState = 'idle' | 'loading' | 'ready' | 'received' | 'expired'

const WEB_BASE = process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'https://tarantuverse.com'

export default function QRSheet({
  visible,
  onClose,
  tarantulaId,
  tarantulaName,
  scientificName,
  onPhotoAdded,
}: QRSheetProps) {
  const { colors } = useTheme()
  const [tab, setTab] = useState<Tab>('upload')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState('')
  const [uploadCount, setUploadCount] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const profileUrl = `${WEB_BASE}/t/${tarantulaId}`

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  useEffect(() => {
    if (!visible) { stopPolling(); setUploadState('idle'); setUploadUrl(null) }
    return stopPolling
  }, [visible])

  const generateSession = async () => {
    setUploadState('loading')
    try {
      const res = await apiClient.post(`/tarantulas/${tarantulaId}/upload-session`)
      const { upload_url, expires_at } = res.data
      setUploadUrl(upload_url)
      setUploadState('ready')

      const exp = new Date(expires_at)

      timerRef.current = setInterval(() => {
        const secs = Math.floor((exp.getTime() - Date.now()) / 1000)
        if (secs <= 0) { setUploadState('expired'); stopPolling() }
        else {
          const m = Math.floor(secs / 60)
          const s = secs % 60
          setTimeLeft(`${m}:${s.toString().padStart(2, '0')}`)
        }
      }, 1000)

      let knownCount = uploadCount
      pollRef.current = setInterval(async () => {
        try {
          const pr = await apiClient.get(`/tarantulas/${tarantulaId}/photos`)
          if (pr.data.length > knownCount) {
            knownCount = pr.data.length
            setUploadCount(pr.data.length)
            setUploadState('received')
            stopPolling()
            onPhotoAdded?.()
          }
        } catch { /* ignore */ }
      }, 3000)

    } catch {
      setUploadState('idle')
      Alert.alert('Error', 'Failed to generate QR code. Please try again.')
    }
  }

  const handleShare = () => {
    Share.share({
      message: `Check out ${tarantulaName} on Tarantuverse: ${profileUrl}`,
      url: profileUrl,
      title: tarantulaName,
    })
  }

  const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    closeBtn: { padding: 4 },
    tabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 4, borderRadius: 10, backgroundColor: colors.background, padding: 3 },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    tabBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    body: { paddingHorizontal: 20, paddingTop: 16, alignItems: 'center' },
    qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
    spiderName: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 2 },
    spiderSci: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginBottom: 12 },
    statusText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 4 },
    timerText: { fontSize: 13, color: colors.primary, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'], marginBottom: 16 },
    successText: { fontSize: 15, color: '#22c55e', fontWeight: '700', textAlign: 'center', marginBottom: 4 },
    actionBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
    actionBtnPrimary: { backgroundColor: colors.primary },
    actionBtnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    actionBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    actionBtnTextSecondary: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    descText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
    linkText: { fontSize: 13, color: colors.primary, textAlign: 'center', marginBottom: 16 },
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>QR Identity</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              {[{ id: 'upload', label: '📸 Add Photo' }, { id: 'profile', label: '🏷️ Profile QR' }].map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
                  onPress={() => setTab(t.id as Tab)}
                >
                  <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <Text style={styles.spiderName}>{tarantulaName}</Text>
              {scientificName && <Text style={styles.spiderSci}>{scientificName}</Text>}

              {/* ── Upload tab ── */}
              {tab === 'upload' && (
                <>
                  {uploadState === 'idle' && (
                    <>
                      <Text style={styles.descText}>
                        Generate a QR code and scan it from another phone to upload photos without logging in.
                      </Text>
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={generateSession}>
                        <Text style={styles.actionBtnText}>Generate Upload QR</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {uploadState === 'loading' && <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />}

                  {(uploadState === 'ready' || uploadState === 'received') && uploadUrl && (
                    <>
                      <View style={styles.qrWrap}>
                        <QRCode value={uploadUrl} size={200} />
                      </View>
                      {uploadState === 'received' ? (
                        <>
                          <Text style={styles.successText}>✅ Photo received!</Text>
                          <Text style={styles.statusText}>The gallery has been updated.</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.statusText}>Scan with another phone's camera</Text>
                          <Text style={styles.timerText}>Expires in {timeLeft}</Text>
                        </>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnSecondary]}
                        onPress={() => { stopPolling(); setUploadState('idle'); setUploadUrl(null) }}
                      >
                        <Text style={styles.actionBtnTextSecondary}>Generate New QR</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {uploadState === 'expired' && (
                    <>
                      <Text style={[styles.statusText, { marginBottom: 16 }]}>QR code expired.</Text>
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => { setUploadState('idle'); setUploadUrl(null) }}>
                        <Text style={styles.actionBtnText}>Generate New QR</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              {/* ── Profile tab ── */}
              {tab === 'profile' && (
                <>
                  <View style={styles.qrWrap}>
                    <QRCode value={profileUrl} size={200} />
                  </View>
                  <Text style={styles.statusText}>Permanent profile QR — links to this spider's public page.</Text>
                  <Text style={styles.linkText} numberOfLines={1}>{profileUrl}</Text>
                  <Text style={styles.descText}>
                    Anyone who scans this can see public info, care requirements, and lineage. Print it on an enclosure label using the web app.
                  </Text>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleShare}>
                    <Text style={styles.actionBtnText}>Share Profile Link</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

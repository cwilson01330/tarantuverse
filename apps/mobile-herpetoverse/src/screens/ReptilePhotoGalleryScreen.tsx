/**
 * Reptile photo gallery — shared between snake + lizard.
 *
 * Three responsibilities:
 *   1. List the animal's photos in a thumb grid.
 *   2. Add a new photo (camera or library) with optional caption.
 *   3. Tap a photo to view full-size + run actions: edit caption,
 *      set as main, delete.
 *
 * Mobile-only behaviors that diverge from the web PhotoGallery:
 *   - No drag-to-reorder. Order is by upload date (server-side).
 *   - Lightbox is a single full-screen Modal rather than a swipeable
 *     pager — keepers usually look at one photo at a time on phone.
 *   - Set-main is a button on the lightbox, not a hover overlay.
 *
 * Backend contract (from `apps/api/app/routers/photos.py`):
 *   - First photo uploaded auto-becomes the animal's main photo.
 *   - PATCH /photos/{id}/set-main updates `*.photo_url` on parent.
 *   - DELETE /photos/{id} cascades file removal in storage_service.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  Field,
  FormErrorBanner,
  SubmitButton,
  ThemedInput,
  extractErrorMessage,
} from '../components/forms/FormPrimitives';
import {
  type Photo,
  type PhotoTaxon,
  deletePhoto,
  listPhotos,
  setMainPhoto,
  updatePhotoCaption,
  uploadPhoto,
} from '../lib/photos';

export function ReptilePhotoGalleryScreen({ taxon }: { taxon: PhotoTaxon }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, layout } = useTheme();

  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add-photo flow
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [newCaption, setNewCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Lightbox / per-photo actions
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    if (!id) return;
    try {
      const data = await listPhotos(taxon, id);
      setPhotos(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(extractErrorMessage(err, "Couldn't load photos."));
      setPhotos((prev) => prev ?? []); // keep showing empty rather than null
    }
  }, [id, taxon]);

  useFocusEffect(
    useCallback(() => {
      fetchPhotos();
    }, [fetchPhotos]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPhotos();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPhotos]);

  // --- Pickers ---------------------------------------------------------
  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera permission needed',
        'Allow camera access in Settings to take photos in the app.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setUploadError(null);
    }
  }

  async function pickFromLibrary() {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Library permission needed',
        'Allow photo library access in Settings to attach existing photos.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setUploadError(null);
    }
  }

  // --- Upload ----------------------------------------------------------
  async function handleUpload() {
    if (!id || !pickedUri || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPhoto({
        taxon,
        animalId: id,
        imageUri: pickedUri,
        caption: newCaption,
      });
      setPickedUri(null);
      setNewCaption('');
      await fetchPhotos();
    } catch (err) {
      setUploadError(extractErrorMessage(err, "Couldn't upload that photo."));
    } finally {
      setUploading(false);
    }
  }

  // --- Per-photo actions (lightbox) -----------------------------------
  function openLightbox(p: Photo) {
    setActivePhoto(p);
    setEditingCaption(false);
    setCaptionDraft(p.caption ?? '');
    setActionError(null);
  }

  function closeLightbox() {
    setActivePhoto(null);
    setEditingCaption(false);
    setCaptionDraft('');
    setActionError(null);
  }

  async function handleSaveCaption() {
    if (!activePhoto || savingCaption) return;
    setSavingCaption(true);
    setActionError(null);
    try {
      const updated = await updatePhotoCaption(
        activePhoto.id,
        captionDraft.trim() || null,
      );
      // Optimistic local update so the lightbox reflects the change
      // before we re-fetch.
      setActivePhoto(updated);
      setPhotos(
        (prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? [],
      );
      setEditingCaption(false);
    } catch (err) {
      setActionError(
        extractErrorMessage(err, "Couldn't save the caption."),
      );
    } finally {
      setSavingCaption(false);
    }
  }

  async function handleSetMain() {
    if (!activePhoto) return;
    setActionError(null);
    try {
      await setMainPhoto(activePhoto.id);
      Alert.alert(
        'Set as main',
        "This photo is now the main photo for this reptile.",
      );
      // No re-fetch needed for the gallery list itself, but the parent
      // detail screen will re-read on focus.
    } catch (err) {
      setActionError(
        extractErrorMessage(err, "Couldn't set this as the main photo."),
      );
    }
  }

  function handleDelete() {
    if (!activePhoto) return;
    Alert.alert(
      'Delete photo?',
      'This permanently removes the file. There is no undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePhoto(activePhoto.id);
              setPhotos(
                (prev) =>
                  prev?.filter((p) => p.id !== activePhoto.id) ?? [],
              );
              closeLightbox();
            } catch (err) {
              setActionError(
                extractErrorMessage(err, "Couldn't delete that photo."),
              );
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView
      edges={['left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Photos', headerBackTitle: 'Back' }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Add-photo card */}
        <View
          style={[
            styles.addCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: layout.radius.lg,
            },
          ]}
        >
          {pickedUri ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: pickedUri }} style={styles.preview} />
              <TouchableOpacity
                onPress={() => setPickedUri(null)}
                style={styles.previewClear}
                accessibilityLabel="Discard selected photo"
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={28}
                  color={colors.danger}
                />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pickerRow}>
              <PickerButton
                icon="camera"
                label="Camera"
                onPress={pickFromCamera}
              />
              <PickerButton
                icon="image-multiple"
                label="Library"
                onPress={pickFromLibrary}
              />
            </View>
          )}

          {pickedUri && (
            <View style={{ gap: 12, marginTop: 12 }}>
              <Field label="Caption" hint="Optional. Up to 500 characters.">
                <ThemedInput
                  value={newCaption}
                  onChangeText={setNewCaption}
                  placeholder="Big shed yesterday — looking glossy"
                  multiline
                  numberOfLines={2}
                  maxLength={500}
                  style={{ minHeight: 60, paddingTop: 10 }}
                />
              </Field>
              {uploadError && <FormErrorBanner message={uploadError} />}
              <SubmitButton
                label="Upload photo"
                busy={uploading}
                onPress={handleUpload}
              />
            </View>
          )}
        </View>

        {/* Existing photos */}
        {loadError && <FormErrorBanner message={loadError} />}

        {photos === null ? (
          <Text style={[styles.muted, { color: colors.textTertiary }]}>
            Loading photos…
          </Text>
        ) : photos.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textTertiary }]}>
            No photos yet. Add one above.
          </Text>
        ) : (
          <View style={styles.thumbGrid}>
            {photos.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => openLightbox(p)}
                style={[
                  styles.thumb,
                  { borderRadius: layout.radius.sm, borderColor: colors.border },
                ]}
                accessibilityRole="imagebutton"
                accessibilityLabel={p.caption ?? 'Untitled photo'}
              >
                <Image
                  source={{ uri: p.thumbnail_url ?? p.url }}
                  style={styles.thumbImage}
                />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Lightbox */}
      <Modal
        visible={!!activePhoto}
        animationType="fade"
        transparent
        onRequestClose={closeLightbox}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalTopRow}>
              <TouchableOpacity
                onPress={closeLightbox}
                style={styles.modalIconBtn}
                accessibilityLabel="Close photo"
              >
                <MaterialCommunityIcons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            {activePhoto && (
              <Image
                source={{ uri: activePhoto.url }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}

            <View style={styles.modalBottom}>
              {actionError && <FormErrorBanner message={actionError} />}

              {editingCaption ? (
                <View style={{ gap: 8 }}>
                  <ThemedInput
                    value={captionDraft}
                    onChangeText={setCaptionDraft}
                    placeholder="Caption"
                    multiline
                    numberOfLines={2}
                    maxLength={500}
                    style={{ minHeight: 60, paddingTop: 10 }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingCaption(false);
                        setCaptionDraft(activePhoto?.caption ?? '');
                      }}
                      style={[
                        styles.lightboxBtn,
                        { backgroundColor: 'rgba(255,255,255,0.1)' },
                      ]}
                    >
                      <Text style={styles.lightboxBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveCaption}
                      disabled={savingCaption}
                      style={[
                        styles.lightboxBtn,
                        {
                          backgroundColor: colors.primary,
                          opacity: savingCaption ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.lightboxBtnText, { color: '#0B0B0B' }]}
                      >
                        {savingCaption ? 'Saving…' : 'Save caption'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  {activePhoto?.caption ? (
                    <Text style={styles.lightboxCaption}>
                      {activePhoto.caption}
                    </Text>
                  ) : (
                    <Text style={styles.lightboxCaptionMuted}>
                      No caption.
                    </Text>
                  )}
                  <View style={styles.lightboxActions}>
                    <LightboxAction
                      icon="pencil"
                      label="Edit caption"
                      onPress={() => {
                        setEditingCaption(true);
                        setCaptionDraft(activePhoto?.caption ?? '');
                      }}
                    />
                    <LightboxAction
                      icon="star"
                      label="Set as main"
                      onPress={handleSetMain}
                    />
                    <LightboxAction
                      icon="trash-can-outline"
                      label="Delete"
                      destructive
                      onPress={handleDelete}
                    />
                  </View>
                </>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Internal mini-components
// ---------------------------------------------------------------------------

function PickerButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, layout } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pickerBtn,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderRadius: layout.radius.md,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={26} color={colors.primary} />
      <Text style={[styles.pickerBtnLabel, { color: colors.textPrimary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function LightboxAction({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.lightboxAction}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={destructive ? '#fb7185' : '#fff'}
      />
      <Text
        style={[
          styles.lightboxActionLabel,
          { color: destructive ? '#fb7185' : '#fff' },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },

  // Add card
  addCard: {
    padding: 16,
    borderWidth: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerBtn: {
    flex: 1,
    paddingVertical: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pickerBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewWrap: {
    position: 'relative',
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
  },
  previewClear: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
  },

  // Thumbs
  thumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thumb: {
    width: '32%',
    aspectRatio: 1,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  muted: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Lightbox
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  modalSafe: {
    flex: 1,
  },
  modalTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  modalIconBtn: {
    padding: 8,
  },
  modalImage: {
    flex: 1,
    width: '100%',
  },
  modalBottom: {
    padding: 16,
    gap: 12,
  },
  lightboxCaption: {
    color: '#f5f5f5',
    fontSize: 14,
    lineHeight: 20,
  },
  lightboxCaptionMuted: {
    color: '#737373',
    fontSize: 13,
    fontStyle: 'italic',
  },
  lightboxActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  lightboxAction: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 4,
    minWidth: 80,
  },
  lightboxActionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  lightboxBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  lightboxBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

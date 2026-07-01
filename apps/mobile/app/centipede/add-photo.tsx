/**
 * Add photo to a centipede — Phase 3b.
 *
 * Slim clone of app/tarantula/add-photo.tsx. Routes to
 * `uploadCentipedePhoto` from the 3a lib; backend writes the FK
 * polymorphically (Phase 1b extended the photos router to recognize
 * invert_id).
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '../../src/contexts/ThemeContext';
import { AppHeader } from '../../src/components/AppHeader';
import { uploadCentipedePhoto } from '../../src/lib/centipedes';

export default function AddCentipedePhotoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors, layout } = useTheme();
  const iconColor = layout.useGradient ? '#fff' : colors.textPrimary;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const ensureCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Camera access is needed to take a photo.',
      );
      return false;
    }
    return true;
  };

  const ensureGalleryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Gallery access is needed to pick a photo.',
      );
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    if (!(await ensureCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    if (!(await ensureGalleryPermission())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!id || !imageUri) {
      Alert.alert('Pick a photo first.');
      return;
    }
    try {
      setUploading(true);

      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      const form = new FormData();
      form.append('file', {
        uri: imageUri,
        name: filename,
        type,
      } as any);
      if (caption.trim()) form.append('caption', caption.trim());

      await uploadCentipedePhoto(id, form);
      router.back();
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail
        ?? (err instanceof Error ? err.message : 'Upload failed.');
      Alert.alert('Could not upload', String(detail));
    } finally {
      setUploading(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Add photo"
        leftAction={
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="close" size={26} color={iconColor} />
          </TouchableOpacity>
        }
        rightAction={
          <TouchableOpacity
            onPress={handleUpload}
            disabled={uploading || !imageUri}
            style={{ opacity: uploading || !imageUri ? 0.4 : 1 }}
          >
            {uploading ? (
              <ActivityIndicator color={iconColor} size="small" />
            ) : (
              <Text style={{ color: iconColor, fontSize: 16, fontWeight: '600' }}>
                Upload
              </Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={'padding'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {imageUri ? (
          <View style={styles.preview}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setImageUri(null)}
              accessibilityLabel="Remove photo"
            >
              <MaterialCommunityIcons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons
              name="image-outline"
              size={64}
              color={colors.textTertiary}
            />
            <Text style={styles.placeholderText}>
              Take or choose a photo
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
            <MaterialCommunityIcons
              name="camera"
              size={22}
              color={colors.primary}
            />
            <Text style={[styles.actionText, { color: colors.primary }]}>
              Camera
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={pickFromGallery}
          >
            <MaterialCommunityIcons
              name="image-multiple"
              size={22}
              color={colors.primary}
            />
            <Text style={[styles.actionText, { color: colors.primary }]}>
              Gallery
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.captionWrap}>
          <Text style={styles.captionLabel}>Caption (optional)</Text>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Pre-molt color shift, full grown, etc."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 16, paddingBottom: 48 },

    preview: {
      position: 'relative',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
    },
    previewImage: { width: '100%', height: 280 },
    removeButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    placeholder: {
      height: 280,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 16,
    },
    placeholderText: { color: colors.textTertiary, fontSize: 14 },

    actions: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionText: { fontSize: 15, fontWeight: '600' },

    captionWrap: { marginTop: 8 },
    captionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textTertiary,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    captionInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      minHeight: 96,
      textAlignVertical: 'top',
    },
  });

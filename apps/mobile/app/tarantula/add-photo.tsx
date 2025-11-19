import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../../src/services/api';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function AddPhotoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera permissions to take photos.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const requestGalleryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need gallery permissions to select photos.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const selectFromGallery = async () => {
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
      Alert.alert('Error', 'Failed to select photo. Please try again.');
    }
  };

  const uploadPhoto = async () => {
    if (!imageUri) {
      Alert.alert('Error', 'Please select or take a photo first.');
      return;
    }

    setUploading(true);
    try {
      // Create FormData for multipart upload
      const formData = new FormData();

      // Extract filename from URI
      const filename = imageUri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      // Append image file
      formData.append('file', {
        uri: imageUri,
        name: filename,
        type: type,
      } as any);

      // Append caption if provided
      if (caption) {
        formData.append('caption', caption);
      }

      // Upload to backend
      await apiClient.post(`/tarantulas/${id}/photos`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      Alert.alert('Success', 'Photo uploaded successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      console.error('Upload error:', error);
      const message = error.response?.data?.detail || 'Failed to upload photo. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Add Photo</Text>
        <TouchableOpacity
          onPress={uploadPhoto}
          style={[
            styles.saveButton,
            { backgroundColor: imageUri && !uploading ? colors.primary : colors.surfaceElevated },
            (uploading || !imageUri) && styles.saveButtonDisabled
          ]}
          disabled={uploading || !imageUri}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <Text style={[
              styles.saveButtonText,
              { color: imageUri ? colors.surface : colors.textTertiary }
            ]}>
              Upload
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Image Preview or Placeholder */}
        {imageUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => setImageUri(null)}
            >
              <MaterialCommunityIcons name="close-circle" size={36} color={colors.error} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.placeholderContainer, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
            <MaterialCommunityIcons name="image-outline" size={80} color={colors.textTertiary} />
            <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>
              No photo selected
            </Text>
            <Text style={[styles.placeholderSubtext, { color: colors.textTertiary }]}>
              Take a photo or choose from gallery
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={takePhoto}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
              <MaterialCommunityIcons name="camera" size={28} color={colors.surface} />
            </View>
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={selectFromGallery}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="image-multiple" size={28} color={colors.surface} />
            </View>
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Caption Input */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Caption (Optional)
          </Text>
          <TextInput
            style={[
              styles.captionInput,
              {
                borderColor: colors.border,
                color: colors.textPrimary,
                backgroundColor: colors.surface,
              }
            ]}
            placeholder="Add a caption for this photo..."
            placeholderTextColor={colors.textTertiary}
            value={caption}
            onChangeText={setCaption}
            multiline
            numberOfLines={3}
            maxLength={500}
          />
          <Text style={[styles.characterCount, { color: colors.textTertiary }]}>
            {caption.length}/500
          </Text>
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  previewContainer: {
    position: 'relative',
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  previewImage: {
    width: '100%',
    height: 400,
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  placeholderContainer: {
    margin: 20,
    height: 300,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  placeholderSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 32,
    gap: 16,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 32,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  captionInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },
});

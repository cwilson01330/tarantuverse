// Camera / library choice for an egg-sac photo. Same expo-image-picker calls
// the animal add-photo screen uses (no new native module).
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

async function ensure(kind: 'camera' | 'gallery'): Promise<boolean> {
  const { status } = kind === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', `${kind === 'camera' ? 'Camera' : 'Gallery'} access is needed.`);
    return false;
  }
  return true;
}

const OPTIONS = { mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: true, aspect: [4, 3] as [number, number], quality: 0.8 };

export async function takeSacPhoto(): Promise<string | null> {
  if (!(await ensure('camera'))) return null;
  const r = await ImagePicker.launchCameraAsync(OPTIONS);
  return !r.canceled && r.assets[0] ? r.assets[0].uri : null;
}

export async function pickSacPhoto(): Promise<string | null> {
  if (!(await ensure('gallery'))) return null;
  const r = await ImagePicker.launchImageLibraryAsync(OPTIONS);
  return !r.canceled && r.assets[0] ? r.assets[0].uri : null;
}

/** Ask camera or library, then resolve to the picked uri (null = cancelled). */
export function chooseSacPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert('Egg sac photo', undefined, [
      { text: 'Take photo', onPress: () => { void takeSacPhoto().then(resolve); } },
      { text: 'Choose from library', onPress: () => { void pickSacPhoto().then(resolve); } },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

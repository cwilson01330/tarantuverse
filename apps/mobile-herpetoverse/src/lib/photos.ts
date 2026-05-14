/**
 * Photo API client.
 *
 * ADR-003: the per-taxon snakes/lizards tables collapsed into `animals`,
 * so list + upload route through `/animals/<id>/photos` regardless of
 * taxon. The shared mutation surface (delete, caption edit, set-main)
 * stays at `/photos/<id>...`. The photos table join column is now
 * `animal_id` (or `tarantula_id` on the Tarantuverse side).
 *
 * Multipart uploads: React Native FormData accepts the `{ uri, name, type }`
 * triple — see `uploadPhoto` below. Don't set `Content-Type` manually;
 * axios + RN figure out the boundary automatically when the body is
 * FormData.
 */
import { apiClient } from '../services/api';

export interface Photo {
  id: string;
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPhotos(animalId: string): Promise<Photo[]> {
  const { data } = await apiClient.get<Photo[]>(
    `/animals/${encodeURIComponent(animalId)}/photos`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Upload (multipart)
// ---------------------------------------------------------------------------

export interface UploadPhotoArgs {
  animalId: string;
  /** Local file URI from expo-image-picker (file://, content://, etc.). */
  imageUri: string;
  caption?: string;
}

export async function uploadPhoto({
  animalId,
  imageUri,
  caption,
}: UploadPhotoArgs): Promise<Photo> {
  const formData = new FormData();

  // Derive a sensible filename + mime from the URI extension. RN's
  // FormData accepts the `{ uri, name, type }` triple — TypeScript
  // doesn't know about it, hence the cast.
  const filename = imageUri.split('/').pop() || 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const ext = match?.[1]?.toLowerCase() ?? 'jpg';
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

  formData.append('file', {
    uri: imageUri,
    name: filename,
    type: mime,
  } as unknown as Blob);

  if (caption && caption.trim()) {
    formData.append('caption', caption.trim());
  }

  const { data } = await apiClient.post<Photo>(
    `/animals/${encodeURIComponent(animalId)}/photos`,
    formData,
    {
      headers: {
        // RN sets the boundary automatically; we just need to flag the
        // type so axios doesn't json-stringify the body.
        'Content-Type': 'multipart/form-data',
      },
      // Long-running upload — bump from the apiClient default of 30s.
      timeout: 60_000,
    },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Mutations (taxon-agnostic)
// ---------------------------------------------------------------------------

export async function deletePhoto(photoId: string): Promise<void> {
  await apiClient.delete(`/photos/${encodeURIComponent(photoId)}`);
}

export async function updatePhotoCaption(
  photoId: string,
  caption: string | null,
): Promise<Photo> {
  const { data } = await apiClient.patch<Photo>(
    `/photos/${encodeURIComponent(photoId)}`,
    { caption },
  );
  return data;
}

export async function setMainPhoto(photoId: string): Promise<void> {
  await apiClient.patch(`/photos/${encodeURIComponent(photoId)}/set-main`);
}

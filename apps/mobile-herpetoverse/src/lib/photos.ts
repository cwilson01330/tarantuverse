/**
 * Photo API client — taxon-aware list/upload, taxon-agnostic mutations.
 *
 * Backend has separate POST/GET endpoints per taxon (`/snakes/<id>/photos`,
 * `/lizards/<id>/photos`) but a single shared mutation surface for delete,
 * caption edit, and set-main (`/photos/<id>...`). Photos belong to one
 * animal at a time — the join column is either `snake_id` or `lizard_id`,
 * and the backend resolves ownership through whichever is set.
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

export type PhotoTaxon = 'snake' | 'lizard';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPhotos(
  taxon: PhotoTaxon,
  animalId: string,
): Promise<Photo[]> {
  const root = taxon === 'snake' ? 'snakes' : 'lizards';
  const { data } = await apiClient.get<Photo[]>(
    `/${root}/${encodeURIComponent(animalId)}/photos`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Upload (multipart)
// ---------------------------------------------------------------------------

export interface UploadPhotoArgs {
  taxon: PhotoTaxon;
  animalId: string;
  /** Local file URI from expo-image-picker (file://, content://, etc.). */
  imageUri: string;
  caption?: string;
}

export async function uploadPhoto({
  taxon,
  animalId,
  imageUri,
  caption,
}: UploadPhotoArgs): Promise<Photo> {
  const root = taxon === 'snake' ? 'snakes' : 'lizards';
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
    `/${root}/${encodeURIComponent(animalId)}/photos`,
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

import { apiClient } from '../services/api';

export type CardKind = 'molt' | 'profile';
export type CardShape = 'story' | 'post' | 'square';
export type CardFrame = 'specimen' | 'notes' | 'herbarium';

/** Composer order (handoff §4): Herbarium · Field notes · Specimen. */
export const FRAMES: { key: CardFrame; label: string }[] = [
  { key: 'herbarium', label: 'Herbarium' },
  { key: 'notes', label: 'Field notes' },
  { key: 'specimen', label: 'Specimen' },
];
/** The keeper's framing for the photo: point to centre (0-1) and zoom (1-4). */
export interface PhotoFocus { x: number; y: number; zoom: number }

/** Width/height of the photo window per frame and shape, so "Adjust photo"
 *  shows roughly what the card will. Mirrors the renderer in
 *  apps/web/src/lib/share-card (story/post/square photo slots). The renderer
 *  crops around the same centre point, so small differences don't matter. */
export const PHOTO_ASPECT: Record<CardFrame, Record<CardShape, number>> = {
  specimen: { story: 968 / 1075, post: 968 / 675, square: 984 / 540 },
  notes: { story: 972 / 1254, post: 972 / 786, square: 972 / 580 },
  herbarium: { story: 900 / 1140, post: 900 / 708, square: 924 / 570 },
};
export const focusKey = (f: PhotoFocus | null) => (f ? `${f.x.toFixed(3)},${f.y.toFixed(3)},${f.zoom.toFixed(2)}` : 'auto');

/** One of the animal's photos, for the composer's photo picker. */
export interface SharePhoto { id: string; url: string; thumbnail_url: string | null; is_main: boolean }

// The renderer returns a full-size PNG by default (older app builds rely on
// that). The composer asks for a half-size JPEG preview (~50 KB instead of
// ~3 MB) and a full-size JPEG to share.
const withParams = (u: string, q: string) => `${u}${u.includes('?') ? '&' : '?'}${q}`;
export const previewImageUrl = (u: string) => withParams(u, 'size=preview&fmt=jpg');
export const shareImageUrl = (u: string) => withParams(u, 'fmt=jpg');
export interface ShareDefaults { fields: string[]; frame: CardFrame }

export const FIELD_LABELS: Record<string, string> = {
  photo: 'Photo', name: 'Name', species: 'Species', sex: 'Sex', in_care: 'Time in care',
  molts: 'Molt count', size: 'Size', size_change: 'Size change', days_in_care: 'Days in care',
};
export const FIELDS: Record<CardKind, string[]> = {
  molt: ['photo', 'name', 'species', 'size_change', 'days_in_care'],
  profile: ['photo', 'name', 'species', 'sex', 'in_care', 'molts', 'size'],
};

export interface ShareCardCreated { image_url: string; card_link: string | null; code: string | null; fields: string[] }
/** Mirrors apps/api/app/schemas/share_card.py::CardLinkItem. */
export interface CardLinkItem { code: string; app: string; kind: CardKind; name: string | null; url: string; created_at: string; revoked_at: string | null }

export async function getShareDefaults(kind: CardKind): Promise<ShareDefaults> {
  const { data } = await apiClient.get<{ fields: string[]; frame?: CardFrame }>(`/share-cards/defaults`, { params: { app: 'tarantuverse', kind } });
  return { fields: data.fields, frame: data.frame ?? 'specimen' };
}
export async function createShareCard(body: { animal_id: string; kind: CardKind; molt_id?: string; fields: string[]; shape: CardShape; frame: CardFrame; photo_id?: string | null; focus?: PhotoFocus | null; link: boolean; preview?: boolean }): Promise<ShareCardCreated> {
  const { data } = await apiClient.post<ShareCardCreated>(`/share-cards/`, { app: 'tarantuverse', ...body });
  return data;
}
export async function listCardLinks(): Promise<CardLinkItem[]> {
  const { data } = await apiClient.get<CardLinkItem[]>(`/card-links/`);
  return data;
}
export async function revokeCardLink(code: string): Promise<void> {
  await apiClient.delete(`/card-links/${encodeURIComponent(code)}`);
}
export async function listSharePhotos(animalId: string): Promise<SharePhoto[]> {
  const { data } = await apiClient.get<SharePhoto[]>(`/share-cards/photos`, { params: { app: 'tarantuverse', animal_id: animalId } });
  return data;
}

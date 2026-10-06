import { apiClient } from '../services/api';

export type CardShape = 'story' | 'post' | 'square';
export type CardFrame = 'specimen' | 'notes' | 'herbarium';

/** Composer order (handoff §4): Herbarium · Field notes · Specimen. */
export const FRAMES: { key: CardFrame; label: string }[] = [
  { key: 'herbarium', label: 'Herbarium' },
  { key: 'notes', label: 'Field notes' },
  { key: 'specimen', label: 'Specimen' },
];
export interface ShareDefaults { fields: string[]; frame: CardFrame }

export const FIELD_LABELS: Record<string, string> = {
  photo: 'Photo', name: 'Name', species: 'Species', sex: 'Sex', in_care: 'Time in care',
  weight: 'Weight', length: 'Length', sheds: 'Shed count',
};
export const FIELDS: string[] = ['photo', 'name', 'species', 'sex', 'in_care', 'weight', 'length', 'sheds'];

export interface ShareCardCreated { image_url: string; card_link: string | null; code: string | null; fields: string[] }
/** Mirrors apps/api/app/schemas/share_card.py::CardLinkItem. */
export interface CardLinkItem { code: string; app: string; kind: 'molt' | 'profile'; name: string | null; url: string; created_at: string; revoked_at: string | null }

export async function getShareDefaults(): Promise<ShareDefaults> {
  const { data } = await apiClient.get<{ fields: string[]; frame?: CardFrame }>(`/share-cards/defaults`, { params: { app: 'herpetoverse', kind: 'profile' } });
  return { fields: data.fields, frame: data.frame ?? 'specimen' };
}
export async function createShareCard(body: { animal_id: string; fields: string[]; shape: CardShape; frame: CardFrame; link: boolean; preview?: boolean }): Promise<ShareCardCreated> {
  const { data } = await apiClient.post<ShareCardCreated>(`/share-cards/`, { app: 'herpetoverse', kind: 'profile', ...body });
  return data;
}
export async function listCardLinks(): Promise<CardLinkItem[]> {
  const { data } = await apiClient.get<CardLinkItem[]>(`/card-links/`);
  return data;
}
export async function revokeCardLink(code: string): Promise<void> {
  await apiClient.delete(`/card-links/${encodeURIComponent(code)}`);
}

import { apiClient } from '../services/api';

export type CardKind = 'molt' | 'profile';
export type CardShape = 'story' | 'post' | 'square';

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

export async function getShareDefaults(kind: CardKind): Promise<string[]> {
  const { data } = await apiClient.get<{ fields: string[] }>(`/share-cards/defaults`, { params: { app: 'tarantuverse', kind } });
  return data.fields;
}
export async function createShareCard(body: { animal_id: string; kind: CardKind; molt_id?: string; fields: string[]; shape: CardShape; link: boolean; preview?: boolean }): Promise<ShareCardCreated> {
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

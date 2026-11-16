// Network calls for the egg sac -> group -> split-out flow. Kept apart from
// egg-sacs.ts so the pure logic there stays importable by jest.
import { apiClient } from '../services/api';
import { sacPhotoFilePart, type EggSac, type SplitLifeStage, type SplitResult } from './egg-sacs';

export async function listInvertEggSacs(invertId: string): Promise<EggSac[]> {
  const { data } = await apiClient.get<EggSac[]>(`/inverts/${invertId}/egg-sacs`);
  return data;
}

export async function createInvertEggSac(invertId: string, payload: Record<string, unknown>): Promise<EggSac> {
  const { data } = await apiClient.post<EggSac>(`/inverts/${invertId}/egg-sacs`, payload);
  return data;
}

export async function hatchEggSac(
  sacId: string,
  payload: { count: number; count_is_estimated: boolean; hatched_on: string },
): Promise<{ egg_sac: EggSac; colony: { id: string; name: string } }> {
  const { data } = await apiClient.post(`/egg-sacs/${sacId}/hatch`, payload);
  return data;
}

export async function failEggSac(sacId: string): Promise<EggSac> {
  const { data } = await apiClient.post<EggSac>(`/egg-sacs/${sacId}/fail`, {});
  return data;
}

export async function splitOutOfColony(
  colonyId: string,
  payload: { count: number; split_on: string; life_stage: SplitLifeStage },
): Promise<SplitResult> {
  const { data } = await apiClient.post<SplitResult>(`/colonies/${colonyId}/split-out`, payload);
  return data;
}

/** Set (or replace) the sac's one photo from a picked image uri. */
export async function uploadEggSacPhoto(sacId: string, imageUri: string): Promise<EggSac> {
  const form = new FormData();
  form.append('file', sacPhotoFilePart(imageUri) as any);
  const { data } = await apiClient.post<EggSac>(`/egg-sacs/${sacId}/photo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function removeEggSacPhoto(sacId: string): Promise<void> {
  await apiClient.delete(`/egg-sacs/${sacId}/photo`);
}

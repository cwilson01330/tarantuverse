// Network calls for the egg sac -> group -> split-out flow. Kept apart from
// egg-sacs.ts so the pure logic there stays importable by jest.
import { apiClient } from '../services/api';
import type { EggSac, SplitLifeStage, SplitResult } from './egg-sacs';

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

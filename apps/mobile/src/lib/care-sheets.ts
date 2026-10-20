/**
 * Printable care sheets for a sitter (API: routers/care_sheets.py).
 *
 * The keeper picks animals → POST /care-sheets/ → a 24-hour link to the
 * print-ready web page (/care-sheet/<token> on the app's web origin). The
 * phone opens it in the browser, where it prints or saves as a PDF — no
 * native module involved, so this ships by OTA.
 *
 * Mirrors apps/web/src/lib/care-sheet.ts and the Herpetoverse copy.
 */
import { apiClient } from '../services/api';
import type { Units } from './units';

export const CARE_SHEET_MAX_ANIMALS = 60;
export const CARE_SHEET_NOTE_MAX = 500;

export interface CareSheetCreated {
  url: string;
  token: string;
  expires_at: string;
}

export async function createCareSheet(body: {
  animal_ids: string[];
  colony_ids: string[];
  note: string | null;
  units: Units;
}): Promise<CareSheetCreated> {
  const res = await apiClient.post<CareSheetCreated>('/care-sheets/', {
    app: 'tarantuverse',
    ...body,
    tz_offset_minutes: new Date().getTimezoneOffset(),
  });
  return res.data;
}

/** A readable message from an API error (FastAPI `detail`). */
export function careSheetError(e: any, fallback = 'Could not make the care sheet.'): string {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (typeof d?.message === 'string') return d.message;
  return fallback;
}

/**
 * Social link normalization + URL construction.
 *
 * Mirrors apps/web/src/lib/social-links.ts — kept deliberately in
 * sync across apps. See that file for the full design rationale.
 * If you update one, update both.
 */

export type SocialPlatform =
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'morphmarket'
  | 'arachnoboards'
  | 'website';

export function normalizeSocialHandle(
  platform: SocialPlatform,
  input: string,
): string {
  let s = input.trim();
  if (!s) return '';

  if (platform === 'website') return s;

  const prefixes: Record<SocialPlatform, RegExp[]> = {
    instagram: [/^https?:\/\/(www\.)?instagram\.com\//i],
    youtube: [
      /^https?:\/\/(www\.)?youtube\.com\/(@|c\/|user\/)?/i,
      /^https?:\/\/(www\.)?youtu\.be\//i,
    ],
    tiktok: [/^https?:\/\/(www\.)?tiktok\.com\/@?/i],
    facebook: [
      /^https?:\/\/(www\.)?facebook\.com\//i,
      /^https?:\/\/(www\.)?fb\.com\//i,
    ],
    morphmarket: [/^https?:\/\/(www\.)?morphmarket\.com\/(stores\/)?/i],
    arachnoboards: [/^https?:\/\/(www\.)?arachnoboards\.com\/(members\/)?/i],
    website: [],
  };

  for (const re of prefixes[platform]) {
    s = s.replace(re, '');
  }

  s = s.replace(/^@+/, '');
  s = s.replace(/\/+$/, '').replace(/[?#].*$/, '');

  return s;
}

export function socialUrl(
  platform: SocialPlatform,
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  const s = stored.trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s)) return s;

  const handle = normalizeSocialHandle(platform, s);
  if (!handle) return null;

  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${handle}`;
    case 'youtube':
      return `https://youtube.com/@${handle}`;
    case 'tiktok':
      return `https://tiktok.com/@${handle}`;
    case 'facebook':
      return `https://facebook.com/${handle}`;
    case 'morphmarket':
      return `https://www.morphmarket.com/stores/${handle}`;
    case 'arachnoboards':
      return `https://arachnoboards.com/members/${handle}`;
    case 'website':
      return /^https?:\/\//i.test(handle) ? handle : `https://${handle}`;
  }
}

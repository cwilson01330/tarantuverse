/**
 * Social link normalization + URL construction.
 *
 * Keepers enter usernames (or @handles) instead of full URLs. The
 * backend stores whatever they typed — we normalize and rebuild URLs
 * at display time. This keeps the form simple AND tolerates legacy
 * full-URL entries from before this change (some keepers already
 * pasted full links, so we must not break those).
 *
 * Rules:
 *  - If the stored value already looks like a URL (starts with http
 *    or contains the platform's domain), return it as-is.
 *  - Otherwise strip a leading @ and any stray whitespace, then
 *    plug the handle into the platform's URL template.
 *
 * Website is special-cased because it has no known domain; we just
 * ensure it has a protocol so the <a> doesn't produce a relative URL.
 */

export type SocialPlatform =
  | "instagram"
  | "youtube"
  | "tiktok"
  | "facebook"
  | "morphmarket"
  | "arachnoboards"
  | "website";

/**
 * Strip URL prefix / leading @ / whitespace from user input so the
 * stored value is just the handle. Tolerates pasted URLs for each
 * platform's common domain patterns.
 */
export function normalizeSocialHandle(
  platform: SocialPlatform,
  input: string,
): string {
  let s = input.trim();
  if (!s) return "";

  // Website is stored as-is (may be any domain).
  if (platform === "website") return s;

  // Strip common URL prefixes for the platform. We do this loosely —
  // catching the obvious forms rather than trying to match every URL
  // variant each platform supports.
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
    morphmarket: [
      /^https?:\/\/(www\.)?morphmarket\.com\/(stores\/)?/i,
    ],
    arachnoboards: [
      /^https?:\/\/(www\.)?arachnoboards\.com\/(members\/)?/i,
    ],
    website: [],
  };

  for (const re of prefixes[platform]) {
    s = s.replace(re, "");
  }

  // Drop leading @ (users often include it on IG / TikTok handles).
  s = s.replace(/^@+/, "");
  // Drop trailing slash and any query string or hash.
  s = s.replace(/\/+$/, "").replace(/[?#].*$/, "");

  return s;
}

/**
 * Build the public URL for a stored social-link value. Tolerant of
 * legacy full-URL values (returns them unchanged).
 */
export function socialUrl(
  platform: SocialPlatform,
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  const s = stored.trim();
  if (!s) return null;

  // Already a full URL? Use it as-is so legacy data keeps working.
  if (/^https?:\/\//i.test(s)) return s;

  const handle = normalizeSocialHandle(platform, s);
  if (!handle) return null;

  switch (platform) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "youtube":
      // YouTube accepts @handles on new-style URLs; preserve the @
      // so /@channel resolves correctly.
      return `https://youtube.com/@${handle}`;
    case "tiktok":
      return `https://tiktok.com/@${handle}`;
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "morphmarket":
      return `https://www.morphmarket.com/stores/${handle}`;
    case "arachnoboards":
      return `https://arachnoboards.com/members/${handle}`;
    case "website":
      // If the keeper pasted "example.com" (no protocol), add https://
      // so the <a> doesn't become a relative URL.
      return /^https?:\/\//i.test(handle) ? handle : `https://${handle}`;
  }
}

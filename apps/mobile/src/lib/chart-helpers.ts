/**
 * Small pure helpers for the analytics chart components
 * (`src/components/charts/`), kept out of the components so jest can run them.
 */

/** "#rgb" / "#rrggbb" -> [r, g, b] (0-255), or null when it isn't a plain hex colour. */
function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21) between two hex colours; null when either isn't plain hex. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The first candidate that reads against `background` (>= `min`, 3:1 is the WCAG
 * floor for graphics); when none does, the one that comes closest. A candidate
 * that can't be parsed counts as readable, so an unusual theme value is never
 * silently swapped out.
 */
export function pickContrasting(background: string, candidates: string[], min = 3): string {
  let best = candidates[0];
  let bestRatio = -1;
  for (const c of candidates) {
    const ratio = contrastRatio(c, background);
    if (ratio == null || ratio >= min) return c;
    if (ratio > bestRatio) {
      best = c;
      bestRatio = ratio;
    }
  }
  return best;
}

/**
 * Width of the figure column in RankedRows: sized to the longest "value · detail"
 * in the set, so every track in one card stays the same length but the column
 * fits its data (and a larger system font). Clamped to 56..140.
 */
export function rankedValueWidth(
  rows: { value: string; detail?: string | null; none?: boolean }[],
  fontScale = 1,
): number {
  let longest = 0;
  for (const r of rows) {
    const text = r.none || !r.detail ? r.value : `${r.value} · ${r.detail}`;
    longest = Math.max(longest, (text ?? '').length);
  }
  const scale = Math.min(1.5, Math.max(1, Number.isFinite(fontScale) ? fontScale : 1));
  return Math.min(140, Math.max(56, Math.ceil(longest * 7.4 * scale) + 4));
}

/**
 * "#rrggbb" + an alpha 0..1 -> "#rrggbbaa" (the tinted icon wells on the Recent
 * rows). Anything that isn't a plain 6-digit hex returns `fallback`, so an
 * unusual theme value never produces an invalid colour string.
 */
export function withAlpha(color: string, alpha: number, fallback: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!m) return fallback;
  const a = Math.round(Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1)) * 255);
  return `#${m[1]}${a.toString(16).padStart(2, '0')}`;
}

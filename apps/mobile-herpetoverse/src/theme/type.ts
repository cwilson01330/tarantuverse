/**
 * Type scale — the same scale Tarantuverse mobile uses (apps/mobile/src/theme/
 * tokens.ts TYPE), so screens shared between the two apps read identically.
 */
import type { TextStyle } from 'react-native';

export const TYPE = {
  display:    { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  title:      { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heading:    { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body:       { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  label:      { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  caption:    { fontSize: 12, fontWeight: '500', lineHeight: 16 },
} as const satisfies Record<string, TextStyle>;

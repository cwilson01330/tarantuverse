'use client'

export default function Error() {
  if (typeof window !== 'undefined') {
    window.location.href = '/500.html';
  }
  return null;
}
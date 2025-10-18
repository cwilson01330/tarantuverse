export default function NotFound() {
  if (typeof window !== 'undefined') {
    window.location.href = '/404.html';
  }
  return null;
}
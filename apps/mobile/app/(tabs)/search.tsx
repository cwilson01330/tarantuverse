// Re-export the search screen so the tab navigator can find it.
// The actual implementation lives at app/search.tsx — keeping it there
// preserves the /search deep-link route while also making it reachable
// from the tab bar via (tabs)/search.
export { default } from '../search';

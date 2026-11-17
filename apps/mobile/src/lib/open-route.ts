/**
 * One rule for opening an in-app route.
 *
 * `router.navigate('/(tabs)/x')` only switches tabs when the caller is inside
 * the tabs. From a screen pushed above them (analytics, what's new, the
 * notification centre, a notification tap on a detail screen) expo-router sends
 * the action to the root stack and mounts a SECOND (tabs) instance, so the user
 * sees two tab bars. From a pushed screen we dismiss back down to the existing
 * tabs instead.
 */
export type RouteLike = {
  canDismiss: () => boolean;
  dismissTo: (href: never) => void;
  navigate: (href: never) => void;
  push: (href: never) => void;
};

export function openRoute(router: RouteLike, href: string): void {
  if (href.startsWith('/(tabs)')) {
    if (router.canDismiss()) router.dismissTo(href as never);
    else router.navigate(href as never);
    return;
  }
  router.push(href as never);
}

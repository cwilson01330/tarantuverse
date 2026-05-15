/**
 * Launcher app shortcuts (long-press the Tarantuverse icon).
 *
 * Wires `expo-quick-actions` so keepers can jump straight from the home
 * screen into the most common starting points. Same module powers
 * Android App Shortcuts and iOS Home Screen Quick Actions; the
 * `expo-quick-actions` plugin handles AndroidManifest.xml / Info.plist
 * config at build time.
 *
 * RESILIENCE: the native module is `require`'d lazily inside a try/catch
 * (same pattern as `google-signin.ts`). Older 0.2.0 builds that don't
 * have the plugin linked yet — say one received an OTA update that
 * imports this file before the new native binary lands — gracefully
 * no-op instead of crashing on import.
 *
 * Each shortcut carries `params.href` and the listener routes via
 * `router.push(href)`. Add a new shortcut by extending `SHORTCUTS`;
 * Android caps at 4 dynamic shortcuts so don't push past that.
 */
import { Platform } from 'react-native';

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  params?: Record<string, unknown>;
};

interface QuickActionsAPI {
  setItems(items: Item[]): Promise<void> | void;
  addListener(
    handler: (item: Item) => void,
  ): { remove: () => void };
}

type Navigate = (href: string) => void;

let module_: QuickActionsAPI | null = null;
let loaded = false;

function loadModule(): QuickActionsAPI | null {
  if (loaded) return module_;
  loaded = true;
  try {
    // Dynamic require keeps the import out of the static graph so older
    // builds without the plugin don't crash before this function runs.
    module_ = require('expo-quick-actions') as QuickActionsAPI;
    return module_;
  } catch (error) {
    console.warn('[QuickActions] Native module not available:', error);
    return null;
  }
}

/** Static shortcut definitions. Android short_label caps at 16 chars. */
const SHORTCUTS: Item[] = [
  {
    id: 'add-tarantula',
    title: 'Add Tarantula',
    subtitle: 'Quick-add a new spider',
    icon: Platform.select({
      ios: 'symbol:plus.circle.fill',
      android: 'add_circle',
    }),
    params: { href: '/tarantula/add' },
  },
  {
    id: 'my-collection',
    title: 'My Collection',
    subtitle: 'Browse every spider you keep',
    icon: Platform.select({
      ios: 'symbol:square.grid.2x2.fill',
      android: 'grid_view',
    }),
    params: { href: '/(tabs)/collection' },
  },
  {
    id: 'feeders',
    title: 'Feeders',
    subtitle: 'Manage your feeder colonies',
    icon: Platform.select({
      ios: 'symbol:ant.fill',
      android: 'bug_report',
    }),
    params: { href: '/feeders' },
  },
];

let activeListener: { remove: () => void } | null = null;

/**
 * Register the static shortcut list and start routing taps. Safe to call
 * repeatedly — re-registers the listener and replaces any prior one so
 * we never end up with duplicate navigation on a single tap.
 */
export function setupQuickActions(navigate: Navigate): void {
  const mod = loadModule();
  if (!mod) return;

  try {
    const result = mod.setItems(SHORTCUTS);
    // setItems may be sync on some platforms / versions; only `.catch`
    // if it actually returned a promise.
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((error) =>
        console.warn('[QuickActions] setItems failed:', error),
      );
    }
  } catch (error) {
    console.warn('[QuickActions] setItems threw:', error);
    return;
  }

  // Replace any prior listener so a re-mount doesn't stack navigations.
  if (activeListener) {
    activeListener.remove();
    activeListener = null;
  }

  try {
    activeListener = mod.addListener((item) => {
      const href = item?.params?.href;
      if (typeof href !== 'string') return;
      try {
        navigate(href);
      } catch (error) {
        console.warn('[QuickActions] navigate failed:', error);
      }
    });
  } catch (error) {
    console.warn('[QuickActions] addListener threw:', error);
  }
}

/** Tear down the listener on unmount. setItems persists across launches. */
export function cleanupQuickActions(): void {
  if (activeListener) {
    activeListener.remove();
    activeListener = null;
  }
}

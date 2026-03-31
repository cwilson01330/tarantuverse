#!/bin/bash

echo "🧹 Cleaning up old dependencies..."

# Remove node_modules
rm -rf node_modules

# Remove lock files
rm -f package-lock.json
rm -f yarn.lock
rm -f pnpm-lock.yaml

# Clear Expo cache
echo "🗑️ Clearing Expo cache..."
npx expo start -c --clear || true

# Clear watchman if installed
if command -v watchman &> /dev/null; then
  echo "👁️ Clearing Watchman cache..."
  watchman watch-del-all
fi

# Clear metro bundler cache
echo "🚇 Clearing Metro bundler cache..."
rm -rf $TMPDIR/metro-* 2>/dev/null || true
rm -rf $TMPDIR/haste-map-* 2>/dev/null || true

echo "📦 Installing dependencies with npm..."
npm install

echo ""
echo "✅ Upgrade complete!"
echo ""
echo "📱 Next steps:"
echo "   1. Run: npm start"
echo "   2. Press 'i' for iOS simulator or 'a' for Android"
echo ""
echo "🔧 If you still have issues:"
echo "   - Delete iOS/Android folders and rebuild"
echo "   - Run: npx expo prebuild --clean"
echo ""

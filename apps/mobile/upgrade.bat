@echo off
echo.
echo 🧹 Cleaning up old dependencies...
echo.

REM Remove node_modules
if exist node_modules rmdir /s /q node_modules

REM Remove lock files
if exist package-lock.json del /f /q package-lock.json
if exist yarn.lock del /f /q yarn.lock
if exist pnpm-lock.yaml del /f /q pnpm-lock.yaml

REM Clear Expo cache
echo 🗑️ Clearing Expo cache...
npx expo start -c --clear 2>nul

REM Clear metro bundler cache
echo 🚇 Clearing Metro bundler cache...
if exist %TEMP%\metro-* rmdir /s /q %TEMP%\metro-* 2>nul
if exist %TEMP%\haste-map-* rmdir /s /q %TEMP%\haste-map-* 2>nul

echo.
echo 📦 Installing dependencies with npm...
call npm install

echo.
echo ✅ Upgrade complete!
echo.
echo 📱 Next steps:
echo    1. Run: npm start
echo    2. Press 'i' for iOS simulator or 'a' for Android
echo.
echo 🔧 If you still have issues:
echo    - Delete iOS/Android folders and rebuild
echo    - Run: npx expo prebuild --clean
echo.
pause

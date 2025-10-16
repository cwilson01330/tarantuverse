@echo off
echo Clearing all Expo and Metro caches...

REM Clear Metro bundler cache
echo Clearing Metro cache...
if exist .metro rmdir /s /q .metro
if exist %TEMP%\metro-* rmdir /s /q %TEMP%\metro-* 2>nul
if exist %TEMP%\haste-map-* rmdir /s /q %TEMP%\haste-map-* 2>nul

REM Clear Expo cache
echo Clearing Expo cache...
if exist .expo rmdir /s /q .expo
npx expo start --clear

REM Clear node cache
echo Clearing Node cache...
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo.
echo ✅ Cache cleared! Now restart with: pnpm start
echo.
pause

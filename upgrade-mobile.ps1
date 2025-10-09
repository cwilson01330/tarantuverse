# Tarantuverse Mobile - Upgrade to Expo SDK 54
# Run this from PowerShell

Write-Host "🧹 Cleaning old dependencies..." -ForegroundColor Cyan

# Navigate to project root
Set-Location $PSScriptRoot

# Remove node_modules from all locations
Write-Host "Removing node_modules directories..."
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps/mobile/node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps/web/node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps/api/node_modules -ErrorAction SilentlyContinue

# Remove lock files
Write-Host "Removing lock files..."
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
Remove-Item -Force pnpm-lock.yaml -ErrorAction SilentlyContinue
Remove-Item -Force apps/mobile/package-lock.json -ErrorAction SilentlyContinue

# Clear pnpm cache
Write-Host "Clearing pnpm cache..."
pnpm store prune

Write-Host ""
Write-Host "📦 Installing dependencies with pnpm..." -ForegroundColor Cyan
Write-Host ""

# Install from root (handles all workspaces)
pnpm install

Write-Host ""
Write-Host "✅ Upgrade complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Next steps:" -ForegroundColor Yellow
Write-Host "   cd apps/mobile"
Write-Host "   pnpm start"
Write-Host "   Press 'i' for iOS simulator or 'a' for Android"
Write-Host ""

# EAS (Expo Application Services) Setup Guide

**Project ID:** `1d412361-4866-482a-a0a6-5d525508d8b8`

## ✅ Setup Complete

Your Tarantuverse mobile app is now configured with EAS CLI! This will enable you to:
- Build production-ready apps for iOS and Android
- Submit to App Store and Google Play
- Use Expo's cloud build infrastructure
- Manage over-the-air (OTA) updates

---

## 📁 Files Configured

### 1. `app.json`
- ✅ Project ID added: `1d412361-4866-482a-a0a6-5d525508d8b8`
- ✅ Bundle identifiers set:
  - iOS: `com.tarantuverse.app`
  - Android: `com.tarantuverse.app`

### 2. `eas.json` (Created)
Three build profiles configured:

#### **Development Build**
```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```
- For testing with Expo Go or development client
- Includes development tools and debugging
- iOS builds for simulator

#### **Preview Build**
```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```
- Internal testing builds
- Android creates APK (easier to share)
- iOS creates ad-hoc build

#### **Production Build**
```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```
- App Store/Play Store ready
- Auto-increments version numbers
- Android creates AAB bundle
- iOS creates release build

---

## 🚀 Next Steps

### 1. **Login to Expo Account**
```bash
npx eas-cli login
```
Enter your Expo account credentials (or create one at https://expo.dev)

### 2. **Configure iOS (Apple Developer Account Required)**
```bash
eas credentials
```
- Add Apple Developer Account
- Configure signing certificates
- Set up provisioning profiles

For `eas.json`, update:
```json
"appleId": "your-apple-id@example.com",
"ascAppId": "your-app-store-connect-id",
"appleTeamId": "your-team-id"
```

### 3. **Configure Android (Google Play Developer Account Required)**
```bash
eas credentials
```
- Create/upload keystore
- Configure service account for automated submission

For automated submission, place service account JSON:
```
apps/mobile/google-play-service-account.json
```

### 4. **First Build Test**
Try a preview build first:
```bash
cd apps/mobile
eas build --profile preview --platform android
```

This creates an APK you can install on any Android device for testing.

---

## 📱 Build Commands Reference

### Development Builds
```bash
# iOS Simulator
eas build --profile development --platform ios

# Android Device/Emulator
eas build --profile development --platform android

# Both platforms
eas build --profile development --platform all
```

### Preview Builds (Internal Testing)
```bash
# Android APK
eas build --profile preview --platform android

# iOS Ad-Hoc
eas build --profile preview --platform ios
```

### Production Builds (App Stores)
```bash
# Production Android AAB
eas build --profile production --platform android

# Production iOS
eas build --profile production --platform ios

# Both platforms
eas build --profile production --platform all
```

---

## 🌐 Submission Commands

### Submit to App Stores
```bash
# Submit to Apple App Store
eas submit --platform ios

# Submit to Google Play Store
eas submit --platform android

# Both stores
eas submit --platform all
```

---

## 🔄 OTA Updates (Over-The-Air)

After initial store submission, you can push updates without resubmitting:

```bash
# Update preview channel
eas update --branch preview --message "Bug fixes"

# Update production channel
eas update --branch production --message "New features"
```

Configure in `app.json`:
```json
"updates": {
  "url": "https://u.expo.dev/1d412361-4866-482a-a0a6-5d525508d8b8"
}
```

---

## 📊 Build Status & Management

### Check Build Status
```bash
eas build:list
```

### View Build Details
```bash
eas build:view [build-id]
```

### Cancel Build
```bash
eas build:cancel [build-id]
```

### View Project Dashboard
Visit: https://expo.dev/accounts/[your-account]/projects/tarantuverse

---

## 🔐 Credentials Management

### View Credentials
```bash
eas credentials
```

### Remove Credentials
```bash
eas credentials -p ios
eas credentials -p android
```

---

## 💡 Pro Tips

### 1. **Use Build Metadata**
Add to `eas.json` builds:
```json
"env": {
  "API_URL": "https://api.tarantuverse.com"
}
```

### 2. **Environment-Specific Builds**
```bash
# Development API
eas build --profile development --platform android

# Production API
eas build --profile production --platform android
```

### 3. **Local Builds (Faster Iteration)**
```bash
eas build --local --profile development --platform android
```
Builds on your machine instead of Expo's servers.

### 4. **Build Caching**
EAS automatically caches dependencies to speed up subsequent builds.

### 5. **Version Management**
The `autoIncrement` option in production profile automatically bumps build numbers.

---

## 🐛 Troubleshooting

### Build Fails - Check Logs
```bash
eas build:view [build-id]
```

### Clear Build Cache
```bash
eas build --clear-cache --profile production --platform android
```

### Credentials Issues
```bash
eas credentials -p ios --clear-provisioning-profile
eas credentials -p android --clear-keystore
```

### Common Errors

**"Not logged in"**
```bash
eas logout
eas login
```

**"Project not found"**
Verify `projectId` in `app.json` matches your Expo dashboard.

**"Build timed out"**
Large builds may need the paid EAS plan for longer build times.

---

## 💰 Pricing Considerations

### Free Tier
- 30 builds per month (combined iOS + Android)
- 15 concurrent update requests

### Production Tier ($29/month)
- Unlimited builds
- Priority build queue
- Faster build machines
- Unlimited OTA updates

For Tarantuverse's needs, start with free tier and upgrade when hitting limits.

---

## 📚 Additional Resources

- **EAS Docs**: https://docs.expo.dev/eas/
- **Build Configuration**: https://docs.expo.dev/build/eas-json/
- **Submit to Stores**: https://docs.expo.dev/submit/introduction/
- **OTA Updates**: https://docs.expo.dev/eas-update/introduction/
- **Credentials**: https://docs.expo.dev/app-signing/

---

## 🎯 Recommended Workflow

### Phase 1: Development (Now)
1. Build and test locally with Expo Go
2. Occasional preview builds for device testing

### Phase 2: Beta Testing
1. Create preview builds
2. Share with beta testers
3. Use OTA updates for quick fixes

### Phase 3: Production Launch
1. Production builds for both platforms
2. Submit to App Store and Google Play
3. Use OTA updates for minor changes
4. New production builds for major updates

---

**Status**: ✅ Ready to build!

**Next Command**: 
```bash
eas login
```

Then try a preview build:
```bash
eas build --profile preview --platform android
```

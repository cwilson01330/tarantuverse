# Tarantuverse Mobile App - Getting Started

## 🚀 Initial Setup Complete!

The mobile app foundation has been implemented with the following features:

### ✅ Completed Features

1. **Authentication System**
   - Login screen with email/password
   - Registration screen with validation
   - Auth context for state management
   - Token storage with AsyncStorage
   - Protected routes (auto-redirect to login if not authenticated)

2. **Navigation Structure**
   - Tab-based navigation with 4 main screens
   - Material Community Icons for beautiful UI
   - Purple theme matching the web app (#7c3aed)

3. **Collection Screen (Dashboard)**
   - Grid view of user's tarantula collection
   - Photo display with placeholder for tarantulas without photos
   - Sex badges (male/female) with color coding
   - Pull-to-refresh functionality
   - Floating Action Button (FAB) for adding new tarantulas
   - Empty state with call-to-action

4. **Profile Screen**
   - User avatar and display name
   - Username display
   - Settings menu structure
   - Logout functionality with confirmation

5. **API Integration**
   - Axios client with auth token interceptor
   - Production API URL configured
   - Error handling and token refresh

## 📱 How to Run the Mobile App

### Prerequisites
- Node.js installed
- Expo CLI
- iOS Simulator (Mac) or Android Emulator, or Expo Go app on your phone

### Installation

1. Navigate to the mobile app directory:
```bash
cd apps/mobile
```

2. Install dependencies (already done):
```bash
npm install
```

3. Start the Expo development server:
```bash
npm start
```

4. Choose your platform:
   - Press `i` for iOS Simulator (Mac only)
   - Press `a` for Android Emulator
   - Scan the QR code with Expo Go app on your phone

## 🎯 Current App Structure

```
apps/mobile/
├── app/
│   ├── (tabs)/           # Main authenticated screens
│   │   ├── _layout.tsx   # Tab navigation setup
│   │   ├── index.tsx     # Collection screen
│   │   ├── community.tsx # Community (placeholder)
│   │   ├── species.tsx   # Species database (placeholder)
│   │   └── profile.tsx   # User profile
│   ├── _layout.tsx       # Root layout with AuthProvider
│   ├── index.tsx         # Splash/redirect screen
│   ├── login.tsx         # Login screen
│   └── register.tsx      # Registration screen
├── src/
│   ├── contexts/
│   │   └── AuthContext.tsx  # Authentication state management
│   └── services/
│       └── api.ts           # API client configuration
└── package.json
```

## 🔧 API Configuration

The mobile app connects to:
- **Production API**: https://tarantuverse-api.onrender.com/api/v1
- You can override this by setting `EXPO_PUBLIC_API_URL` environment variable

## 🎨 Design Features

- **Color Scheme**: Purple theme (#7c3aed) matching web app
- **Icons**: Material Community Icons from @expo/vector-icons
- **Layout**: Native iOS/Android feel with platform-specific behaviors
- **Typography**: Clean, modern font with proper hierarchy
- **Cards**: Shadow effects for depth and visual hierarchy
- **Empty States**: Friendly messages and clear CTAs

## 📋 Next Steps (To Be Implemented)

### High Priority
1. **Tarantula Detail Screen**
   - Full profile view with all data
   - Photo gallery
   - Feeding/molt logs
   - Edit/delete actions

2. **Add Tarantula Form**
   - Camera integration with expo-image-picker
   - Species selection
   - Form validation

3. **Quick Log Screens**
   - Fast feeding log entry
   - Molt log with measurements
   - Photo attachment

### Medium Priority
4. **Community Features**
   - Keeper discovery
   - Public profiles
   - Message board (mobile-optimized)

5. **Species Database**
   - Browse species
   - Search functionality
   - Care sheet viewer
   - Add to collection from species

### Low Priority
6. **Profile Settings**
   - Edit profile
   - Privacy settings
   - Notification preferences

7. **Advanced Features**
   - Push notifications
   - Offline support
   - Image caching
   - Data synchronization

## 🧪 Testing the App

1. **Test Login**:
   - Use your existing web account credentials
   - Or create a new account

2. **View Collection**:
   - After login, you'll see your tarantulas in a grid
   - Pull down to refresh

3. **Navigation**:
   - Tap tabs at the bottom to navigate
   - Community, Species, and Profile tabs are available

4. **Logout**:
   - Go to Profile tab
   - Tap Logout
   - Confirm the action

## 🐛 Troubleshooting

### Can't connect to API
- Make sure your phone/emulator has internet access
- Check if the API URL is correct in `src/services/api.ts`
- Try accessing https://tarantuverse-api.onrender.com/api/v1/auth/me in a browser

### App crashes on startup
- Clear cache: `npm start -- --clear`
- Reinstall dependencies: `rm -rf node_modules && npm install`

### Images not loading
- Check internet connection
- Verify photo URLs are accessible
- Check CORS settings on the API

## 📦 Dependencies Added

- `@react-native-async-storage/async-storage` - Local storage for tokens
- `expo-constants` - Access to app constants
- Already included: `axios`, `expo-router`, `expo-image-picker`, etc.

## 🎓 Development Tips

### Hot Reloading
- Changes to code will automatically reload the app
- Shake your device to open the developer menu

### Debugging
- Use `console.log()` for debugging
- Check the terminal for logs
- Use React Native Debugger for advanced debugging

### API Testing
- Test API endpoints in Postman first
- Check network requests in the Expo Developer Menu

## 🚢 Building for Production

### iOS (requires Mac)
```bash
npm run build:ios
```

### Android
```bash
npm run build:android
```

### Distribution
- Use EAS Build for production builds
- Submit to App Store / Google Play

## 📱 Current Status

**Mobile App Phase 1 Complete! 🎉**
- ✅ Authentication fully working
- ✅ Collection view displaying tarantulas
- ✅ Navigation structure in place
- ✅ Profile management ready
- ⏳ Additional features in development

You can now login, view your collection, and navigate through the app. The foundation is solid and ready for more features!

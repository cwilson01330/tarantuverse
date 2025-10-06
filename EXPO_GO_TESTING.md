# 📱 Testing Tarantuverse Mobile with Expo Go

## Quick Start Guide

### Step 1: Install Expo Go on Your Phone

**iOS:**
- Open the App Store
- Search for "Expo Go"
- Install the app

**Android:**
- Open Google Play Store
- Search for "Expo Go"
- Install the app

### Step 2: Start the Development Server

Open your terminal and run:

```bash
cd apps/mobile
npm start
```

This will start the Metro bundler and show you a QR code.

### Step 3: Connect Your Phone

**iOS (iPhone):**
1. Open the Camera app
2. Point it at the QR code in your terminal
3. Tap the notification that appears
4. Expo Go will open and load your app

**Android:**
1. Open the Expo Go app
2. Tap "Scan QR Code"
3. Point your camera at the QR code in your terminal
4. The app will load

### Step 4: Test the App

1. **Login Screen**: You'll see the purple Tarantuverse logo with login form
2. **Create Account**: 
   - Tap "Don't have an account? Register"
   - Fill in email, username, password
   - Tap "Create Account"
3. **View Collection**: After login, you'll see your tarantulas in a grid
4. **Navigate**: Use the tabs at the bottom:
   - 🕷️ Collection - Your tarantulas
   - 👥 Community - Coming soon
   - 📚 Species - Coming soon
   - 👤 Profile - Your profile and logout

## 🔧 Troubleshooting

### "Can't connect to development server"
1. Make sure your phone and computer are on the same WiFi network
2. Try running: `npm start -- --tunnel`
3. Some corporate/school WiFi networks block this - try a different network

### "Network request failed" when logging in
- The app is trying to connect to: https://tarantuverse-api.onrender.com
- Make sure your phone has internet access
- Try opening that URL in your phone's browser to verify it works

### App crashes or won't load
1. Shake your phone to open Expo menu
2. Tap "Reload"
3. If that doesn't work, close Expo Go completely and try again

### QR code not working
In the terminal, you'll see options:
- Press `i` for iOS Simulator (if you have a Mac)
- Press `a` for Android Emulator (if you have Android Studio)
- Or manually type the URL shown in the terminal into Expo Go app

## 📝 Development Workflow

### Making Changes
1. Edit any file in `apps/mobile/`
2. Save the file
3. The app will automatically reload on your phone (hot reload)

### Viewing Logs
- Terminal shows console.log output
- Shake phone → "Debug Remote JS" for Chrome DevTools

### Common Commands
```bash
# Start development server
npm start

# Start with tunnel (for different networks)
npm start -- --tunnel

# Clear cache if things are weird
npm start -- --clear

# Stop the server
Ctrl + C
```

## ✅ What to Test

### Authentication
- [ ] Register a new account
- [ ] Login with existing account
- [ ] See error messages for invalid credentials
- [ ] Auto-redirect after login

### Collection Screen
- [ ] View your tarantulas in grid
- [ ] See photos and sex badges
- [ ] Pull down to refresh
- [ ] See empty state if no tarantulas
- [ ] Tap floating + button (not functional yet)

### Navigation
- [ ] Switch between tabs
- [ ] All tabs load without crashing

### Profile
- [ ] See your username and display name
- [ ] Tap logout
- [ ] Confirm logout dialog
- [ ] Redirected back to login

## 🎯 Current Limitations

**Not Yet Implemented:**
- Adding/editing tarantulas
- Tarantula detail view
- Taking/uploading photos
- Feeding/molt logs
- Community features
- Species database

These features are coming next!

## 📱 Testing Tips

1. **Test on real device first** - Simulators don't have cameras
2. **Shake gesture** - Opens Expo developer menu
3. **Double-tap R** - Reloads the app
4. **Logs** - Check terminal for console.log output
5. **Network** - Make sure you're on the same WiFi as your computer

## 🐛 Found a Bug?

Common issues and fixes:

1. **White screen**: Close and reopen Expo Go
2. **"Unable to resolve module"**: Run `npm install` in apps/mobile
3. **Old code showing**: Shake → Reload, or restart metro bundler
4. **Photos not loading**: This is normal if your tarantulas don't have photos yet

## 🎨 What You'll See

**Login Screen:**
- 🕷️ Purple theme
- Email and password inputs
- "Login" button
- "Register" link

**Collection Screen:**
- Grid of tarantula cards (2 columns)
- Each card shows:
  - Photo (or placeholder)
  - Name
  - Scientific name
  - Common name
  - Sex badge (if set)
- Pull-to-refresh
- Floating + button (bottom right)

**Profile Screen:**
- Avatar (or placeholder)
- Display name
- Username
- Settings menu
- Logout button

Enjoy testing! 🕷️📱

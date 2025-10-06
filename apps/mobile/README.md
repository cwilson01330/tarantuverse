# Tarantuverse Mobile App

React Native mobile app built with Expo.

## Getting Started

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
# From project root
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start Development

```bash
# Start Expo dev server
pnpm start

# Run on iOS simulator
pnpm ios

# Run on Android emulator
pnpm android

# Run in web browser
pnpm web
```

## Project Structure

```
src/
├── screens/      # Screen components
├── components/   # Reusable components
├── navigation/   # Navigation configuration
├── services/     # API client & services
└── utils/        # Utilities & helpers

app/              # Expo Router pages
├── _layout.tsx   # Root layout
├── index.tsx     # Home screen
└── (tabs)/       # Tab navigation (TODO)
```

## Tech Stack

- **Framework**: Expo / React Native
- **Navigation**: Expo Router
- **Language**: TypeScript
- **State Management**: Zustand
- **Forms**: React Hook Form + Zod
- **HTTP Client**: Axios

## Development

### Testing on Physical Device

1. Install Expo Go app on your phone
2. Scan QR code from terminal
3. App will load on your device

### Building for Production

#### Android

```bash
eas build --platform android
```

#### iOS

```bash
eas build --platform ios
```

### Publishing Updates

```bash
eas update
```

## Features

- [ ] User authentication
- [ ] Collection management
- [ ] Feeding logs
- [ ] Molt tracking
- [ ] Photo galleries
- [ ] Breeding tools
- [ ] Push notifications
- [ ] Offline support

## API Integration

The app connects to the FastAPI backend at `EXPO_PUBLIC_API_URL`.

```typescript
import apiClient from '@/services/api'

const response = await apiClient.get('/api/v1/tarantulas')
```

## Deployment

Deploy with EAS (Expo Application Services):

```bash
# Configure EAS
eas build:configure

# Build for production
eas build --platform all

# Submit to stores
eas submit --platform all
```

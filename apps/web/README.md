# Tarantuverse Web App

Next.js 14 web application for Tarantuverse.

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

### 3. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Homepage
│   └── globals.css   # Global styles
├── components/       # React components
├── lib/              # Utilities & API client
└── stores/           # State management (Zustand)
```

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm type-check` - Run TypeScript type checking

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Forms**: React Hook Form + Zod
- **HTTP Client**: Axios

## Development

### Adding a New Page

Create a new folder in `src/app/`:

```typescript
// src/app/dashboard/page.tsx
export default function Dashboard() {
  return <div>Dashboard</div>
}
```

### Creating a Component

```typescript
// src/components/TarantulaCard.tsx
interface TarantulaCardProps {
  name: string
  species: string
}

export function TarantulaCard({ name, species }: TarantulaCardProps) {
  return (
    <div className="p-4 border rounded-lg">
      <h3>{name}</h3>
      <p>{species}</p>
    </div>
  )
}
```

### Making API Calls

```typescript
import apiClient from '@/lib/api'

const response = await apiClient.get('/api/v1/tarantulas')
const tarantulas = response.data
```

## Deployment

Deploy to Vercel:

```bash
vercel
```

Or build and deploy manually:

```bash
pnpm build
pnpm start
```

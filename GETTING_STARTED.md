# Getting Started with Tarantuverse

This guide will help you get the Tarantuverse development environment up and running.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Python** 3.11+ ([Download](https://www.python.org/))
- **PostgreSQL** 15+ ([Download](https://www.postgresql.org/))
- **pnpm** 8+ (Install: `npm install -g pnpm`)
- **Docker** (Optional, for containerized database)

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd tarantuverse

# Install all dependencies
pnpm install

# Install Python dependencies
cd apps/api
pip install -r requirements.txt
cd ../..
```

### 2. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration
# At minimum, update:
# - DATABASE_URL
# - API_SECRET_KEY
```

### 3. Start PostgreSQL

**Option A: Using Docker (Recommended)**
```bash
docker-compose up -d postgres
```

**Option B: Using Local PostgreSQL**
```bash
# Create database
createdb tarantuverse

# Or using psql
psql -U postgres
CREATE DATABASE tarantuverse;
\q
```

### 4. Run Database Migrations

```bash
cd apps/api

# Initialize Alembic (first time only)
alembic init alembic

# Create initial migration
alembic revision --autogenerate -m "Initial migration"

# Run migrations
alembic upgrade head

cd ../..
```

### 5. Start Development Servers

**Start All Apps (Recommended)**
```bash
pnpm dev
```

This will start:
- Web app on http://localhost:3000
- API on http://localhost:8000
- API docs on http://localhost:8000/docs

**Or Start Individually**

```bash
# Terminal 1: API
pnpm dev:api

# Terminal 2: Web
pnpm dev:web

# Terminal 3: Mobile
pnpm dev:mobile
```

## Verify Everything Works

### Test the API
```bash
curl http://localhost:8000/health
# Should return: {"status":"healthy","database":"connected"}
```

### Test the Web App
Open http://localhost:3000 in your browser. You should see the Tarantuverse landing page.

### Test the Mobile App
```bash
cd apps/mobile
pnpm start
```
Scan the QR code with Expo Go app on your phone.

## Next Steps

### 1. Explore the API Documentation
Visit http://localhost:8000/docs to see interactive API documentation.

### 2. Read the Documentation
- [Project Plan](./PROJECT_PLAN.md) - Full architecture and roadmap
- [API README](./apps/api/README.md) - Backend details
- [Web README](./apps/web/README.md) - Web app details
- [Mobile README](./apps/mobile/README.md) - Mobile app details

### 3. Start Developing

**Add Your First Species**
```bash
# Using the API directly (you'll need authentication later)
curl -X POST http://localhost:8000/api/v1/species \
  -H "Content-Type: application/json" \
  -d '{
    "scientific_name": "Brachypelma hamorii",
    "common_names": ["Mexican Red Knee"],
    "care_level": "beginner"
  }'
```

**Create Your First Page**
```bash
# Web app
mkdir apps/web/src/app/collection
touch apps/web/src/app/collection/page.tsx

# Mobile app
mkdir apps/mobile/app/collection
touch apps/mobile/app/collection/index.tsx
```

## Common Issues

### Port Already in Use
```bash
# Find and kill process on port 3000, 8000, etc.
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

### Database Connection Error
- Ensure PostgreSQL is running
- Verify DATABASE_URL in .env is correct
- Check database exists: `psql -l | grep tarantuverse`

### Module Not Found (Python)
```bash
# Ensure you're in the api directory and have activated venv (if using one)
cd apps/api
pip install -r requirements.txt
```

### Module Not Found (Node.js)
```bash
# Clean install
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

## Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

3. **Test your changes**
   ```bash
   pnpm lint
   pnpm test
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "Add your feature"
   git push origin feature/your-feature-name
   ```

### Database Changes

When modifying models:

```bash
cd apps/api

# Create a new migration
alembic revision --autogenerate -m "Description of changes"

# Review the migration file in alembic/versions/

# Apply the migration
alembic upgrade head
```

## Useful Commands

### Project-wide
```bash
pnpm dev              # Start all apps
pnpm build            # Build all apps
pnpm lint             # Lint all apps
pnpm test             # Test all apps
pnpm clean            # Remove all node_modules
```

### API
```bash
cd apps/api
uvicorn app.main:app --reload    # Start dev server
alembic upgrade head              # Run migrations
pytest                            # Run tests
black app/                        # Format code
ruff check app/                   # Lint code
```

### Web
```bash
cd apps/web
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm lint             # Lint
pnpm type-check       # TypeScript check
```

### Mobile
```bash
cd apps/mobile
pnpm start            # Start Expo dev server
pnpm ios              # Run on iOS
pnpm android          # Run on Android
```

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

## Getting Help

- Check the [PROJECT_PLAN.md](./PROJECT_PLAN.md) for architecture details
- Review component READMEs in each app directory
- Open an issue on GitHub
- Check existing issues for similar problems

---

**Happy Coding! 🕷️**

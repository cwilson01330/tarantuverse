# Tarantuverse API

FastAPI backend for the Tarantuverse application.

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp ../../.env.example ../../.env
# Edit .env with your configuration
```

### 3. Start PostgreSQL

```bash
# Using Docker Compose from project root
cd ../..
docker-compose up -d postgres
```

### 4. Run Migrations

```bash
# Initialize Alembic (first time only)
alembic init alembic

# Create a migration
alembic revision --autogenerate -m "Initial migration"

# Run migrations
alembic upgrade head
```

### 5. Start Development Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at:
- **API**: http://localhost:8000
- **Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Project Structure

```
app/
├── main.py           # FastAPI app entry point
├── config.py         # Configuration settings
├── database.py       # Database connection
├── models/           # SQLAlchemy ORM models
├── schemas/          # Pydantic schemas (TODO)
├── routers/          # API route handlers
├── services/         # Business logic (TODO)
└── utils/            # Utilities (TODO)
```

## Development

### Code Formatting

```bash
black app/
ruff check app/
```

### Type Checking

```bash
mypy app/
```

### Testing

```bash
pytest
```

## API Endpoints

See [API Documentation](../../docs/api/README.md) for full endpoint reference.

### Quick Reference

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/tarantulas` - List tarantulas
- `POST /api/v1/tarantulas` - Create tarantula
- `GET /api/v1/species` - Search species
- `POST /api/v1/tarantulas/{id}/feedings` - Log feeding
- `POST /api/v1/tarantulas/{id}/molts` - Log molt

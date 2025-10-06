"""
Tarantuverse API - Main Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, tarantulas, species, feedings, molts

app = FastAPI(
    title="Tarantuverse API",
    description="Tarantula husbandry tracking platform API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(tarantulas.router, prefix="/api/v1/tarantulas", tags=["tarantulas"])
app.include_router(species.router, prefix="/api/v1/species", tags=["species"])
app.include_router(feedings.router, prefix="/api/v1/feedings", tags=["feedings"])
app.include_router(molts.router, prefix="/api/v1/molts", tags=["molts"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "Tarantuverse API",
        "version": "0.1.0",
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "database": "connected",  # TODO: Add actual DB health check
    }

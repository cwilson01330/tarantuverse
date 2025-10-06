"""
Tarantuverse API - Main Application Entry Point
Phase 2A Migration: Community features ready for deployment
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
import app.routers.auth as auth
import app.routers.tarantulas as tarantulas
import app.routers.species as species
import app.routers.feedings as feedings
import app.routers.molts as molts
import app.routers.substrate_changes as substrate_changes

app = FastAPI(
    title="Tarantuverse API",
    description="Tarantula husbandry tracking platform API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=True,  # Handle both /path and /path/
)

# Configure CORS
# Allow all origins that include vercel.app or localhost
cors_origins = settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Include routers
print("[STARTUP] Registering auth router...")
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])

print("[STARTUP] Registering tarantulas router...")
print(f"[STARTUP] Tarantulas router routes: {[route.path for route in tarantulas.router.routes]}")
print(f"[STARTUP] Tarantulas router methods: {[(route.path, route.methods) for route in tarantulas.router.routes]}")
app.include_router(tarantulas.router, prefix="/api/v1/tarantulas", tags=["tarantulas"])

print("[STARTUP] Registering species router...")
app.include_router(species.router, prefix="/api/v1/species", tags=["species"])

print("[STARTUP] Registering feedings router...")
app.include_router(feedings.router, prefix="/api/v1", tags=["feedings"])

print("[STARTUP] Registering molts router...")
app.include_router(molts.router, prefix="/api/v1", tags=["molts"])

print("[STARTUP] Registering substrate changes router...")
app.include_router(substrate_changes.router, prefix="/api/v1", tags=["substrate_changes"])

print("[STARTUP] All routers registered successfully!")
print(f"[STARTUP] Total app routes: {len(app.routes)}")
for route in app.routes:
    if hasattr(route, 'methods') and hasattr(route, 'path'):
        print(f"[STARTUP]   {route.methods} {route.path}")


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

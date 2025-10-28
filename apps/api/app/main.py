"""
Tarantuverse API - Main Application Entry Point
Phase 2C Week 3: Collection Dashboard & Analytics
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
import os
from app.config import settings
import app.routers.auth as auth
import app.routers.tarantulas as tarantulas
import app.routers.species as species
import app.routers.feedings as feedings
import app.routers.molts as molts
import app.routers.substrate_changes as substrate_changes
import app.routers.keepers as keepers
import app.routers.messages as messages
import app.routers.photos as photos
import app.routers.analytics as analytics
import app.routers.follows as follows
import app.routers.direct_messages as direct_messages
import app.routers.forums as forums
import app.routers.activity as activity
import app.routers.subscriptions as subscriptions
import app.routers.pairings as pairings
import app.routers.egg_sacs as egg_sacs
import app.routers.offspring as offspring

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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Middleware to handle OPTIONS requests
@app.middleware("http")
async def options_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Max-Age": "3600",
            }
        )
    return await call_next(request)

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

print("[STARTUP] Registering keepers/community router...")
app.include_router(keepers.router, prefix="/api/v1/keepers", tags=["keepers", "community"])

print("[STARTUP] Registering messages/board router...")
app.include_router(messages.router, prefix="/api/v1/messages", tags=["messages", "community"])

print("[STARTUP] Registering photos router...")
app.include_router(photos.router, prefix="/api/v1", tags=["photos"])

print("[STARTUP] Registering analytics router...")
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])

print("[STARTUP] Registering follows router...")
app.include_router(follows.router, tags=["follows", "community"])

print("[STARTUP] Registering direct messages router...")
app.include_router(direct_messages.router, tags=["direct_messages", "community"])

print("[STARTUP] Registering forums router...")
app.include_router(forums.router, tags=["forums", "community"])

print("[STARTUP] Registering activity feed router...")
app.include_router(activity.router, tags=["activity", "community"])

print("[STARTUP] Registering subscriptions router...")
app.include_router(subscriptions.router, prefix="/api/v1", tags=["subscriptions"])

print("[STARTUP] Registering pairings router...")
app.include_router(pairings.router, prefix="/api/v1", tags=["pairings", "breeding"])

print("[STARTUP] Registering egg sacs router...")
app.include_router(egg_sacs.router, prefix="/api/v1", tags=["egg_sacs", "breeding"])

print("[STARTUP] Registering offspring router...")
app.include_router(offspring.router, prefix="/api/v1", tags=["offspring", "breeding"])

# Mount static files for uploaded photos
uploads_dir = "uploads"
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "photos"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "thumbnails"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
print("[STARTUP] Mounted /uploads static files directory")

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

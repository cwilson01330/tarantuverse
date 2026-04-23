"""
Tarantuverse API - Main Application Entry Point
Phase 2C Week 3: Collection Dashboard & Analytics
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import os
from app.config import settings
from app.utils.rate_limit import limiter  # shared limiter instance
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
import app.routers.notification_preferences as notification_preferences
import app.routers.import_export as import_export
import app.routers.admin as admin
import app.routers.admin_analytics as admin_analytics
import app.routers.promo_codes as promo_codes
import app.routers.user_blocks as user_blocks
import app.routers.content_reports as content_reports
import app.routers.pricing as pricing
import app.routers.theme_preferences as theme_preferences
import app.routers.enclosures as enclosures
import app.routers.referrals as referrals
import app.routers.announcements as announcements
import app.routers.system_settings as system_settings
import app.routers.premolt as premolt
import app.routers.achievements as achievements
import app.routers.search as search
import app.routers.discover as discover
import app.routers.qr as qr
import app.routers.feeder_species as feeder_species
import app.routers.feeder_colonies as feeder_colonies
import app.routers.waitlist as waitlist
import app.routers.snakes as snakes  # Herpetoverse v1
import app.routers.sheds as sheds  # Herpetoverse v1
import app.routers.genes as genes  # Herpetoverse v1 — morph catalog
import app.routers.reptile_species as reptile_species  # Herpetoverse v1
import app.routers.animal_genotypes as animal_genotypes  # Herpetoverse v1
import app.routers.weight_logs as weight_logs  # Herpetoverse v1 — Sprint 5

app = FastAPI(
    title="Tarantuverse API",
    description="Tarantula husbandry tracking platform API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=True,  # Handle both /path and /path/
)

# Attach rate limiter to app state and register 429 handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
# Automatically include both www and non-www versions of each origin
cors_origins = settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"]
expanded_cors_origins = []
for origin in cors_origins:
    expanded_cors_origins.append(origin)
    # Add www version if not present
    if origin.startswith("https://") and not origin.startswith("https://www."):
        www_version = origin.replace("https://", "https://www.")
        expanded_cors_origins.append(www_version)
    # Add non-www version if www is present
    elif origin.startswith("https://www."):
        non_www_version = origin.replace("https://www.", "https://")
        expanded_cors_origins.append(non_www_version)

print(f"[STARTUP] CORS Origins configured: {expanded_cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=expanded_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # Explicit header allowlist — avoids credential + wildcard CORS violation
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Authorization",
        "Content-Type",
        "Origin",
        "X-Requested-With",
        "X-Request-ID",
    ],
    expose_headers=["X-Request-ID"],
    max_age=3600,
)

# Maintenance mode middleware — blocks write requests for non-admins
@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    # Only check write methods
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        # Allow the system-status and health endpoints through always
        path = request.url.path
        safe_paths = ("/", "/health", "/api/v1/system/status", "/api/v1/auth/login")
        if not any(path.startswith(sp) for sp in safe_paths):
            try:
                from app.services import settings_service
                from app.database import SessionLocal
                db = SessionLocal()
                try:
                    if settings_service.is_maintenance_mode(db):
                        allow_admin = settings_service.get(db, "maintenance.allow_admin_writes", True)
                        # If admin writes allowed, check the token
                        is_admin = False
                        if allow_admin:
                            auth_header = request.headers.get("authorization", "")
                            if auth_header.startswith("Bearer "):
                                from app.utils.auth import decode_access_token
                                from app.models.user import User
                                payload = decode_access_token(auth_header[7:])
                                if payload and payload.get("sub"):
                                    user = db.query(User).filter(User.id == payload["sub"]).first()
                                    if user and (user.is_admin or user.is_superuser):
                                        is_admin = True
                        if not is_admin:
                            from fastapi.responses import JSONResponse
                            msg = settings_service.get_maintenance_message(db)
                            return JSONResponse(
                                status_code=503,
                                content={"detail": msg, "maintenance_mode": True},
                            )
                finally:
                    db.close()
            except Exception:
                pass  # If settings can't be read, don't block requests

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

# Registering notification preferences router...
app.include_router(notification_preferences.router, prefix="/api/v1", tags=["notifications"])

print("[STARTUP] Registering import/export router...")
app.include_router(import_export.router, prefix="/api/v1", tags=["import-export"])

print("[STARTUP] Registering admin router...")
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])

print("[STARTUP] Registering admin analytics router...")
app.include_router(admin_analytics.router, prefix="/api/v1", tags=["admin-analytics"])

print("[STARTUP] Registering promo codes router...")
app.include_router(promo_codes.router, prefix="/api/v1/promo-codes", tags=["promo_codes", "premium"])

print("[STARTUP] Registering user blocks router...")
app.include_router(user_blocks.router, prefix="/api/v1", tags=["blocks", "moderation"])

print("[STARTUP] Registering content reports router...")
app.include_router(content_reports.router, prefix="/api/v1", tags=["reports", "moderation"])

print("[STARTUP] Registering pricing router...")
app.include_router(pricing.router, prefix="/api/v1", tags=["pricing", "valuation"])

print("[STARTUP] Registering theme preferences router...")
app.include_router(theme_preferences.router, prefix="/api/v1", tags=["theme", "customization"])

print("[STARTUP] Registering enclosures router...")
app.include_router(enclosures.router, prefix="/api/v1/enclosures", tags=["enclosures", "communal"])

print("[STARTUP] Registering referrals router...")
app.include_router(referrals.router, prefix="/api/v1", tags=["referrals", "premium"])

print("[STARTUP] Registering announcements router...")
app.include_router(announcements.router, prefix="/api/v1/announcements", tags=["announcements"])

print("[STARTUP] Registering system settings router...")
app.include_router(system_settings.router, prefix="/api/v1", tags=["system-settings"])

print("[STARTUP] Registering premolt prediction router...")
app.include_router(premolt.router, prefix="/api/v1/premolt", tags=["premolt", "analytics"])

print("[STARTUP] Registering achievements router...")
app.include_router(achievements.router, prefix="/api/v1", tags=["achievements", "gamification"])

print("[STARTUP] Registering global search router...")
app.include_router(search.router, prefix="/api/v1", tags=["search"])

print("[STARTUP] Registering discover router...")
app.include_router(discover.router, prefix="/api/v1", tags=["discover", "community"])
app.include_router(qr.router, prefix="/api/v1", tags=["qr", "identity"])

print("[STARTUP] Registering feeder routers...")
app.include_router(feeder_species.router, prefix="/api/v1/feeder-species", tags=["feeders"])
app.include_router(feeder_colonies.router, prefix="/api/v1/feeder-colonies", tags=["feeders"])

print("[STARTUP] Registering waitlist router...")
app.include_router(waitlist.router, prefix="/api/v1", tags=["waitlist", "public"])

print("[STARTUP] Registering snakes router (Herpetoverse v1)...")
app.include_router(snakes.router, prefix="/api/v1/snakes", tags=["snakes", "herpetoverse"])

print("[STARTUP] Registering sheds router (Herpetoverse v1)...")
app.include_router(sheds.router, prefix="/api/v1", tags=["sheds", "herpetoverse"])

# Morph catalog + welfare data for the breeding calculator (Sprint 4)
app.include_router(genes.router, prefix="/api/v1/genes", tags=["genes", "herpetoverse"])
app.include_router(reptile_species.router, prefix="/api/v1/reptile-species", tags=["reptile_species", "herpetoverse"])
# animal_genotypes routes are nested under /snakes/{id}/genotype — keep the generic /api/v1 prefix
app.include_router(animal_genotypes.router, prefix="/api/v1", tags=["animal_genotypes", "herpetoverse"])

# Sprint 5 — standalone weigh-ins + feeding advisory. Routes include both
# /snakes/{id}/weight-logs/* and /weight-logs/{id}, so keep the /api/v1 prefix.
print("[STARTUP] Registering weight logs router (Herpetoverse v1 Sprint 5)...")
app.include_router(weight_logs.router, prefix="/api/v1", tags=["weight_logs", "herpetoverse"])

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

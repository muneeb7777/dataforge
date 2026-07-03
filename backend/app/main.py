"""DataForge FastAPI application entrypoint."""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import datasets, explore, exports, fred, stats, studio, viz
from app.core.config import get_settings
from app.core.users import auth_backend, current_active_user, fastapi_users
from app.schemas.user import UserCreate, UserRead, UserUpdate

settings = get_settings()

app = FastAPI(
    title="DataForge API",
    description="Full-stack data engineering and analytics platform.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["*"]
        if settings.environment == "development"
        else [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    """Liveness/readiness probe used by docker-compose healthchecks and CI."""
    return {"status": "ok", "environment": settings.environment}


# Auth (step 11): open register/login endpoints; everything data-facing below
# requires an active user.
app.include_router(
    fastapi_users.get_auth_router(auth_backend), prefix="/api/auth/jwt", tags=["auth"]
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate), prefix="/api/auth", tags=["auth"]
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/api/users", tags=["users"]
)

# Data routers (BUILD ORDER steps 3-10), all JWT-protected.
_protected = [Depends(current_active_user)]
app.include_router(datasets.router, dependencies=_protected)
app.include_router(explore.router, dependencies=_protected)
app.include_router(studio.router, dependencies=_protected)
app.include_router(viz.router, dependencies=_protected)
app.include_router(stats.router, dependencies=_protected)
app.include_router(exports.router, dependencies=_protected)
app.include_router(fred.router, dependencies=_protected)

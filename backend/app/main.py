"""FastAPI main application."""

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import Base, engine

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

_DEFAULT_LOCALHOST_ORIGINS = "http://localhost:5173,http://localhost:3000"

# Rate limiter — uses settings for default limit
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_DEFAULT],
)


def _validate_production_config() -> None:
    """Log warnings if critical env vars look wrong for production."""
    if settings.APP_ENV != "production":
        return

    if not settings.CLERK_SECRET_KEY.startswith("sk_live_"):
        logger.warning(
            "SECURITY: CLERK_SECRET_KEY does not start with 'sk_live_' — "
            "Clerk auth may not work correctly in production."
        )

    if not settings.ENCRYPTION_KEY:
        logger.warning(
            "SECURITY: ENCRYPTION_KEY is not set — "
            "BYOK API keys cannot be encrypted. Set a Fernet key."
        )

    if settings.ALLOWED_ORIGINS == _DEFAULT_LOCALHOST_ORIGINS:
        logger.warning(
            "SECURITY: ALLOWED_ORIGINS is still set to default localhost values. "
            "Update it to your production frontend domain."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME}")
    logger.info(f"Environment: {settings.APP_ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")

    _validate_production_config()

    if settings.APP_ENV == "development":
        logger.warning(
            "DEV AUTH BYPASS is ACTIVE. Requests without an Authorization header "
            "(or with 'Bearer dev-bypass') will authenticate as dev_user_local. "
            "Do NOT use APP_ENV=development in production."
        )

    # Create database tables (in production, use Alembic migrations instead)
    if settings.DEBUG:
        logger.info("Creating database tables...")
        Base.metadata.create_all(bind=engine)

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.PROJECT_NAME}")
    engine.dispose()


# Create FastAPI app - disable docs in production
app = FastAPI(
    title=settings.PROJECT_NAME,
    debug=settings.DEBUG,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Security headers middleware — runs before CORS so headers are set on every response.
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# Pre-CORS origin validation — reject OPTIONS from unknown origins before CORS
# can attach permissive headers.  Registered after security headers so it runs
# before them (LIFO order), which means bad origins are rejected early.
@app.middleware("http")
async def reject_unknown_origins(request: Request, call_next):
    if request.method == "OPTIONS":
        origin = request.headers.get("origin", "")
        if origin and origin not in settings.allowed_origins_list:
            return Response(status_code=403, content="Forbidden")
    return await call_next(request)


# Configure CORS - restrict methods and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# Custom exception handlers — hide internal details from clients
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": "Invalid request data"})


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
async def root():
    """Root endpoint."""
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Clerk Frontend API proxy — used by Cloudflare Pages Function to avoid
# the Cloudflare-to-Cloudflare CNAME conflict (Error 1000/525).
# Flow: Browser → Pages Function (methodex.ai/__clerk) → Railway → Clerk
# Origin-validated: only requests from ALLOWED_ORIGINS are accepted.
_clerk_client = httpx.AsyncClient(base_url="https://frontend-api.clerk.dev", timeout=15.0)

# Whitelist of headers safe to forward to Clerk
_CLERK_PROXY_ALLOWED_HEADERS = {
    "content-type", "accept", "accept-language", "user-agent",
    "x-forwarded-for", "cf-connecting-ip",
}

# Whitelist of Clerk API path prefixes we actually need
_CLERK_PROXY_ALLOWED_PATHS = {"v1/client", "v1/environment"}


@app.api_route("/__clerk_fwd/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def clerk_proxy(path: str, request: Request):
    # Validate that the request originates from an allowed origin
    origin = request.headers.get("origin", "")
    if origin not in settings.allowed_origins_list:
        return Response(content=b"Forbidden", status_code=403)

    # Validate path against whitelist
    if not any(path.startswith(prefix) for prefix in _CLERK_PROXY_ALLOWED_PATHS):
        return Response(content=b"Not Found", status_code=404)

    # Filter headers — only forward whitelisted ones
    filtered_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() in _CLERK_PROXY_ALLOWED_HEADERS
    }
    filtered_headers["Clerk-Secret-Key"] = settings.CLERK_SECRET_KEY or ""

    body = await request.body()
    resp = await _clerk_client.request(
        method=request.method,
        url=f"/{path}",
        headers=filtered_headers,
        params=dict(request.query_params),
        content=body if body else None,
    )
    return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


# Import and include routers
from app.routes import models, projects, transcriptions, users, videos

# Register routers with API prefix and tags
app.include_router(
    users.router,
    prefix=f"{settings.API_V1_PREFIX}/users",
    tags=["users"]
)

app.include_router(
    projects.router,
    prefix=f"{settings.API_V1_PREFIX}/projects",
    tags=["projects"]
)

app.include_router(
    videos.router,
    prefix=f"{settings.API_V1_PREFIX}/videos",
    tags=["videos"]
)

app.include_router(
    transcriptions.router,
    prefix=f"{settings.API_V1_PREFIX}/transcripts",
    tags=["transcripts"]
)

app.include_router(
    models.router,
    prefix=f"{settings.API_V1_PREFIX}/models",
    tags=["models"]
)


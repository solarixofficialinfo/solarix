"""
Centralized Evolution API & WhatsApp Gateway Configuration.

Enforces:
1. Reading EVOLUTION_API_URL from environment variables (os.environ.get("EVOLUTION_API_URL")).
2. In production (Render, Vercel, or ENVIRONMENT/NODE_ENV=production):
   - Never silently fall back to localhost (127.0.0.1:8080, 127.0.0.1:8085, etc.).
   - If EVOLUTION_API_URL is missing, return empty string and provide a clear configuration error.
3. In local development:
   - Allow fallback to local development URL only when explicitly running in development mode.
4. Logging on startup:
   - "Evolution API URL configured: <URL>" (or warning if unconfigured).
   - NEVER logs API keys, tokens, passwords, or secrets.
"""
import os
import logging
from typing import Optional, Tuple, Any

logger = logging.getLogger("evolution_config")


def is_production() -> bool:
    """
    Returns True if the application is running in a production environment
    (e.g., hosted on Render, Vercel, or marked with ENVIRONMENT/NODE_ENV=production).
    """
    if os.environ.get("RENDER") or os.environ.get("RENDER_SERVICE_ID"):
        return True
    if os.environ.get("VERCEL"):
        return True
    env = (os.environ.get("ENVIRONMENT") or os.environ.get("ENV") or os.environ.get("NODE_ENV") or "").lower()
    if env in ("production", "prod"):
        return True
    return False


def get_evolution_api_url(override_url: Optional[Any] = None) -> str:
    """
    Returns the centralized Evolution API base URL.
    
    Precedence:
    1. override_url (if provided from DB / Provider Settings)
    2. os.environ.get("EVOLUTION_API_URL")
    3. In local development only: http://127.0.0.1:8080
    4. In production: returns empty string "" (never attempts localhost)
    """
    if override_url and override_url.strip():
        # If an override URL is set in DB or form, use it
        url = override_url.strip().rstrip("/")
        # In production, block localhost overrides unless explicitly allowed
        if is_production() and ("127.0.0.1" in url or "localhost" in url):
            env_url = (os.environ.get("EVOLUTION_API_URL") or "").strip().rstrip("/")
            if env_url and not ("127.0.0.1" in env_url or "localhost" in env_url):
                return env_url
            return ""
        return url
        
    env_url = (os.environ.get("EVOLUTION_API_URL") or "").strip().rstrip("/")
    if env_url:
        return env_url
        
    if is_production():
        # In production, do NOT silently fall back to localhost
        return ""
        
    # Local development fallback only
    return (os.environ.get("DEV_EVOLUTION_API_URL") or "http://127.0.0.1:8080").rstrip("/")


def get_evolution_api_key() -> str:
    """Returns the configured Evolution API Key from environment."""
    return (os.environ.get("EVOLUTION_API_KEY") or "").strip()


def get_evolution_instance() -> str:
    """Returns the configured Evolution Instance Name from environment."""
    return (os.environ.get("EVOLUTION_INSTANCE") or "solarix_primary").strip()


def validate_evolution_config(url: Optional[Any] = None) -> Tuple[bool, str]:
    """
    Validates the Evolution API URL configuration.
    Returns (is_valid: bool, error_message: str).
    """
    effective_url = url if url is not None else get_evolution_api_url()
    if not effective_url:
        if is_production():
            return (
                False,
                "EVOLUTION_API_URL is not configured. Please set the EVOLUTION_API_URL environment variable in your production deployment settings (e.g. in the Render dashboard) to your Evolution service URL."
            )
        return (
            False,
            "EVOLUTION_API_URL is not configured. Please configure EVOLUTION_API_URL in backend/.env."
        )
    return (True, "")


def log_evolution_config():
    """Logs the configured Evolution API URL at startup without leaking secrets."""
    url = get_evolution_api_url()
    if url:
        logger.info(f"Evolution API URL configured: {url}")
    else:
        if is_production():
            logger.error("EVOLUTION_API_URL is not configured in production! Please set EVOLUTION_API_URL in Render dashboard.")
        else:
            logger.warning("EVOLUTION_API_URL is not configured; using local development configuration.")

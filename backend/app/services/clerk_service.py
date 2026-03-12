"""Clerk Backend API service for fetching user data."""
import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)


async def fetch_clerk_user(user_id: str) -> dict | None:
    """Fetch user profile from Clerk Backend API."""
    if not settings.CLERK_SECRET_KEY:
        logger.warning("CLERK_SECRET_KEY not set, cannot fetch user data from Clerk")
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.clerk.com/v1/users/{user_id}",
                headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
            # Extract the primary email
            email = None
            primary_email_id = data.get("primary_email_address_id")
            for ea in data.get("email_addresses", []):
                if ea.get("id") == primary_email_id:
                    email = ea.get("email_address")
                    break
            if not email and data.get("email_addresses"):
                email = data["email_addresses"][0].get("email_address")

            return {
                "email": email,
                "first_name": data.get("first_name"),
                "last_name": data.get("last_name"),
                "username": data.get("username"),
                "image_url": data.get("image_url"),
            }
    except Exception as e:
        logger.error(f"Failed to fetch Clerk user {user_id}: {e}")
        return None

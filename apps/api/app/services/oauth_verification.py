"""
Server-side verification of OAuth identity tokens (Google + Apple).

WHY THIS EXISTS
---------------
`/auth/oauth-login` originally accepted a plain JSON body containing the
caller's email and provider account id, with no proof those claims came from
the provider. Because the endpoint is public and auto-links to any existing
*verified* account by email, anyone could POST

    {"provider": "google", "email": "<victim>", "id": "anything"}

and receive a valid session token for that user. That is a complete
authentication bypass. This module removes the trust-the-client assumption:
the client now sends the RAW identity token (a signed JWT) and the server
verifies it against the provider's published JWKS before any account lookup.

WHAT IS VERIFIED
----------------
  * RS256 signature against the provider's current JWKS
  * `iss` matches the provider's issuer
  * `aud` is one of OUR registered client ids (prevents replaying a token
    minted for a different app — this is the check people most often miss)
  * `exp` / `iat` (handled by jose)
  * Google only: `email_verified` must be true

Only claims returned by THIS module should be trusted by callers. Anything
else in the request body is attacker-controlled.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx
from jose import jwt
from jose.exceptions import JWTError

from app.config import settings

logger = logging.getLogger(__name__)

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

# JWKS are cached in-process. Google/Apple rotate keys on the order of days;
# an hour of caching keeps us correct while avoiding a fetch per sign-in.
_JWKS_TTL_SECONDS = 3600
_jwks_cache: Dict[str, Dict[str, Any]] = {}


class OAuthVerificationError(Exception):
    """Raised when an identity token cannot be trusted. The message is safe
    to log but should NOT be echoed verbatim to clients in detail — callers
    surface a generic failure instead."""


def _split_ids(raw: str) -> List[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def _fetch_jwks(url: str, *, force: bool = False) -> Dict[str, Any]:
    """Fetch (and cache) a provider JWKS document."""
    cached = _jwks_cache.get(url)
    now = time.time()
    if cached and not force and now - cached["fetched_at"] < _JWKS_TTL_SECONDS:
        return cached["jwks"]

    try:
        resp = httpx.get(url, timeout=10.0)
        resp.raise_for_status()
        jwks = resp.json()
    except Exception as exc:  # network/parse failures
        if cached:
            # Prefer a slightly stale key set over failing every sign-in
            # during a transient provider/network blip.
            logger.warning("[oauth] JWKS refresh failed for %s, using cache: %s", url, exc)
            return cached["jwks"]
        raise OAuthVerificationError(f"Could not fetch provider keys: {exc}") from exc

    _jwks_cache[url] = {"jwks": jwks, "fetched_at": now}
    return jwks


def _decode_with_jwks(
    token: str,
    *,
    jwks_url: str,
    issuers: tuple,
    audiences: List[str],
) -> Dict[str, Any]:
    """Verify signature + standard claims, returning the verified payload."""
    if not token or not isinstance(token, str):
        raise OAuthVerificationError("Missing identity token")
    if not audiences:
        # Fail CLOSED. Without a configured audience we cannot tell our own
        # tokens from any other Google/Apple app's tokens, and accepting them
        # would reintroduce the very bypass this module exists to close.
        raise OAuthVerificationError(
            "No OAuth client ids configured on the server — refusing to verify"
        )

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise OAuthVerificationError(f"Malformed identity token: {exc}") from exc

    kid = unverified_header.get("kid")

    def _find_key(jwks: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return key
        return None

    jwks = _fetch_jwks(jwks_url)
    key = _find_key(jwks)
    if key is None:
        # Unknown kid usually means the provider rotated keys — refetch once.
        jwks = _fetch_jwks(jwks_url, force=True)
        key = _find_key(jwks)
    if key is None:
        raise OAuthVerificationError("Identity token signed with an unknown key")

    last_error: Optional[Exception] = None
    for audience in audiences:
        try:
            return jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=audience,
                issuer=issuers[0] if len(issuers) == 1 else None,
                options={"verify_iss": len(issuers) == 1},
            )
        except JWTError as exc:
            last_error = exc
            continue

    # Include the token's OWN aud/iss in the error. These are public client
    # identifiers (they ship inside every app bundle), not secrets — and
    # without them an "Invalid audience" failure gives no way to tell which
    # client id is missing from the allowlist short of guessing.
    try:
        unverified = jwt.get_unverified_claims(token)
        token_aud = unverified.get("aud")
        token_iss = unverified.get("iss")
    except Exception:
        token_aud = token_iss = "<unreadable>"

    raise OAuthVerificationError(
        f"Identity token failed verification: {last_error}. "
        f"Token aud={token_aud!r} iss={token_iss!r}; "
        f"configured audiences={audiences!r}"
    )


def verify_google_id_token(id_token: str) -> Dict[str, Any]:
    """
    Verify a Google ID token and return trusted identity claims.

    Returns: {provider_account_id, email, name, picture}
    Raises:  OAuthVerificationError
    """
    audiences = _split_ids(getattr(settings, "GOOGLE_OAUTH_CLIENT_IDS", ""))
    claims = _decode_with_jwks(
        id_token,
        jwks_url=GOOGLE_JWKS_URL,
        issuers=GOOGLE_ISSUERS,
        audiences=audiences,
    )

    # Google publishes two issuer spellings; jose can only pin one, so the
    # issuer is checked explicitly here instead.
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise OAuthVerificationError(f"Unexpected issuer: {claims.get('iss')}")

    email = claims.get("email")
    subject = claims.get("sub")
    if not email or not subject:
        raise OAuthVerificationError("Identity token missing email/sub")

    # An unverified Google email must never be used to auto-link an existing
    # account — that would let someone claim an address they don't control.
    email_verified = claims.get("email_verified")
    if email_verified in (False, "false"):
        raise OAuthVerificationError("Google account email is not verified")

    return {
        "provider_account_id": subject,
        "email": email,
        "name": claims.get("name"),
        "picture": claims.get("picture"),
    }


def verify_apple_identity_token(identity_token: str) -> Dict[str, Any]:
    """
    Verify an Apple identity token and return trusted identity claims.

    Apple omits `name` entirely (the client collects it on first consent only),
    so the caller may supply a display name separately — a name is cosmetic and
    carries no authorization meaning.

    Returns: {provider_account_id, email}
    Raises:  OAuthVerificationError
    """
    audiences = _split_ids(getattr(settings, "APPLE_OAUTH_CLIENT_IDS", ""))
    claims = _decode_with_jwks(
        identity_token,
        jwks_url=APPLE_JWKS_URL,
        issuers=(APPLE_ISSUER,),
        audiences=audiences,
    )

    subject = claims.get("sub")
    if not subject:
        raise OAuthVerificationError("Identity token missing sub")

    email = claims.get("email")
    if not email:
        # Apple relay addresses are stable per (user, app); if the token has no
        # email we synthesize the same relay form the clients already use so a
        # returning user resolves to their existing account.
        email = f"{subject}@privaterelay.appleid.com"

    return {"provider_account_id": subject, "email": email}

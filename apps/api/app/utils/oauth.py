"""
OAuth helpers.

Sign-in with Google and Apple goes through POST /auth/oauth-login (and
/auth/link-account-direct), which verify the provider's ID token signature in
`app/services/oauth_verification.py`. The old code-exchange routes
(/auth/oauth/google, /auth/oauth/apple, /auth/link-account) and their helpers
here were removed on 2026-10-27: no client called them, and the Apple helper
decoded tokens WITHOUT checking the signature.
"""


def generate_username_from_email(email: str) -> str:
    """
    Generate a unique username from email for OAuth users
    """
    # Take the part before @ and sanitize
    base_username = email.split("@")[0]
    # Remove non-alphanumeric characters
    base_username = "".join(c for c in base_username if c.isalnum() or c == "_")
    # Limit to 30 chars
    base_username = base_username[:30]
    return base_username

"""
Authentication utilities - password hashing and JWT tokens
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.config import settings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    # Truncate to 72 characters to comply with bcrypt limit
    truncated_password = plain_password[:72]
    return pwd_context.verify(truncated_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    # Truncate to 72 characters to comply with bcrypt limit
    truncated_password = password[:72]
    return pwd_context.hash(truncated_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token with a unique jti claim for revocation support.

    Args:
        data: Dictionary to encode in the token (usually {"sub": user_id})
        expires_delta: Optional expiration time delta

    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    # jti (JWT ID) allows individual tokens to be revoked
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
    })
    encoded_jwt = jwt.encode(to_encode, settings.API_SECRET_KEY, algorithm=settings.API_ALGORITHM)

    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and verify a JWT access token

    Args:
        token: The JWT token to decode

    Returns:
        Decoded token payload or None if invalid
    """
    try:
        payload = jwt.decode(token, settings.API_SECRET_KEY, algorithms=[settings.API_ALGORITHM])
        return payload
    except JWTError:
        return None


def is_token_revoked(jti: str, db: Session) -> bool:
    """Check if a token's jti has been added to the blocklist."""
    from app.models.token_blocklist import TokenBlocklist
    return db.query(TokenBlocklist).filter(TokenBlocklist.jti == jti).first() is not None


def revoke_token(jti: str, user_id: str, expires_at: datetime, db: Session) -> None:
    """Add a token's jti to the blocklist."""
    from app.models.token_blocklist import TokenBlocklist
    entry = TokenBlocklist(jti=jti, user_id=user_id, expires_at=expires_at)
    db.add(entry)
    db.commit()


def cleanup_expired_blocklist(db: Session) -> int:
    """Remove expired entries from the blocklist (call periodically)."""
    from app.models.token_blocklist import TokenBlocklist
    now = datetime.now(timezone.utc)
    deleted = db.query(TokenBlocklist).filter(TokenBlocklist.expires_at < now).delete()
    db.commit()
    return deleted

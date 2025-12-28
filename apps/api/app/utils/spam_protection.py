"""
Spam protection utilities for forum posts and other user-generated content.

Implements multiple layers of protection:
1. Rate limiting - Prevent rapid posting
2. Account requirements - Verified email + account age
3. Honeypot fields - Catch automated bots
4. Content filtering - Block spam patterns
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
import re

from app.models.user import User
from app.models.forum import ForumThread, ForumPost


# ============================================================================
# Configuration
# ============================================================================

# Rate limiting settings
RATE_LIMIT_POSTS_PER_HOUR = 10  # Max posts per hour for established users
RATE_LIMIT_NEW_USER_POSTS_PER_HOUR = 5  # Max posts per hour for new users
NEW_USER_THRESHOLD_DAYS = 7  # Users under this age are "new"

# Account requirements
MIN_ACCOUNT_AGE_HOURS = 24  # Account must be at least 24 hours old to post

# Content filtering patterns
SPAM_LINK_THRESHOLD = 3  # Max number of links allowed in a single post
SPAM_KEYWORDS = [
    # Crypto/NFT spam
    "crypto", "bitcoin", "ethereum", "nft", "airdrop", "token sale",
    "wallet connect", "metamask", "seed phrase",
    # General spam
    "click here", "act now", "limited time", "make money fast",
    "work from home", "earn money online", "free gift",
    # Pharma spam
    "viagra", "cialis", "pharmacy", "prescription",
    # Adult spam
    "xxx", "porn", "adult content", "onlyfans",
]

# Repeated character detection (e.g., "hellooooooo" or "!!!!!!")
REPEATED_CHAR_THRESHOLD = 5  # Same char repeated more than this is suspicious

# URL patterns
URL_PATTERN = re.compile(
    r'https?://[^\s<>"{}|\\^`\[\]]+|www\.[^\s<>"{}|\\^`\[\]]+'
)


# ============================================================================
# Rate Limiting
# ============================================================================

def check_rate_limit(
    db: Session,
    user: User,
    window_hours: int = 1
) -> Tuple[bool, Optional[str]]:
    """
    Check if user has exceeded post rate limit.

    Returns:
        Tuple of (is_allowed, error_message)
    """
    # Admins bypass rate limiting
    if user.is_admin or user.is_superuser:
        return True, None

    # Determine if user is "new"
    account_age = datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)
    is_new_user = account_age < timedelta(days=NEW_USER_THRESHOLD_DAYS)

    # Set appropriate limit
    max_posts = RATE_LIMIT_NEW_USER_POSTS_PER_HOUR if is_new_user else RATE_LIMIT_POSTS_PER_HOUR

    # Count posts in the last hour
    window_start = datetime.now(timezone.utc) - timedelta(hours=window_hours)

    # Count threads created
    thread_count = db.query(func.count(ForumThread.id)).filter(
        ForumThread.author_id == user.id,
        ForumThread.created_at >= window_start
    ).scalar() or 0

    # Count posts created
    post_count = db.query(func.count(ForumPost.id)).filter(
        ForumPost.author_id == user.id,
        ForumPost.created_at >= window_start
    ).scalar() or 0

    total_posts = thread_count + post_count

    if total_posts >= max_posts:
        return False, f"Rate limit exceeded. You can post up to {max_posts} times per hour. Please wait before posting again."

    return True, None


# ============================================================================
# Account Requirements
# ============================================================================

def check_account_requirements(user: User) -> Tuple[bool, Optional[str]]:
    """
    Check if user meets posting requirements.

    Requirements:
    - Email must be verified
    - Account must be at least MIN_ACCOUNT_AGE_HOURS old

    Returns:
        Tuple of (is_allowed, error_message)
    """
    # Admins bypass requirements
    if user.is_admin or user.is_superuser:
        return True, None

    # Check email verification
    if not user.is_verified:
        return False, "Please verify your email address before posting in the forums."

    # Check account age
    account_age = datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)
    if account_age < timedelta(hours=MIN_ACCOUNT_AGE_HOURS):
        hours_remaining = MIN_ACCOUNT_AGE_HOURS - (account_age.total_seconds() / 3600)
        return False, f"Your account is too new. Please wait {int(hours_remaining)} more hours before posting."

    return True, None


# ============================================================================
# Honeypot Validation
# ============================================================================

def validate_honeypot(honeypot_value: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validate honeypot field. Bots typically fill this field, humans don't see it.

    The honeypot field should be empty. If it contains any value, reject the request.

    Returns:
        Tuple of (is_valid, error_message)
    """
    if honeypot_value and honeypot_value.strip():
        # Don't give away that this is a honeypot - return generic error
        return False, "Unable to submit. Please try again."

    return True, None


# ============================================================================
# Content Filtering
# ============================================================================

def check_content(content: str, title: Optional[str] = None) -> Tuple[bool, Optional[str]]:
    """
    Check content for spam patterns.

    Checks:
    - Excessive links (more than SPAM_LINK_THRESHOLD)
    - Known spam keywords
    - Repeated characters (bot behavior)
    - Empty or too short content

    Returns:
        Tuple of (is_allowed, error_message)
    """
    # Combine title and content for checking
    full_text = content
    if title:
        full_text = f"{title} {content}"

    full_text_lower = full_text.lower()

    # Check for empty/too short content
    if len(content.strip()) < 10:
        return False, "Post content is too short. Please write at least 10 characters."

    # Check for excessive links
    links = URL_PATTERN.findall(full_text)
    if len(links) > SPAM_LINK_THRESHOLD:
        return False, f"Too many links in your post. Maximum {SPAM_LINK_THRESHOLD} links allowed."

    # Check for spam keywords
    for keyword in SPAM_KEYWORDS:
        if keyword.lower() in full_text_lower:
            return False, "Your post was flagged as potential spam. If you believe this is an error, please contact support."

    # Check for repeated characters (like "hellooooooo" or "!!!!!!!!")
    if has_excessive_repeated_chars(full_text):
        return False, "Please avoid using excessive repeated characters."

    # Check for all caps (shouting)
    words = re.findall(r'[A-Za-z]+', full_text)
    if words:
        caps_words = [w for w in words if w.isupper() and len(w) > 2]
        if len(caps_words) > len(words) * 0.5:  # More than 50% caps
            return False, "Please avoid using excessive capital letters."

    return True, None


def has_excessive_repeated_chars(text: str) -> bool:
    """Check if text contains excessive repeated characters."""
    if not text:
        return False

    count = 1
    prev_char = None

    for char in text:
        if char == prev_char:
            count += 1
            if count > REPEATED_CHAR_THRESHOLD:
                return True
        else:
            count = 1
        prev_char = char

    return False


# ============================================================================
# Combined Spam Check
# ============================================================================

def full_spam_check(
    db: Session,
    user: User,
    content: str,
    title: Optional[str] = None,
    honeypot: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """
    Perform all spam checks in order.

    Checks performed:
    1. Honeypot validation (catch bots)
    2. Account requirements (verified + age)
    3. Rate limiting (prevent spam floods)
    4. Content filtering (block spam patterns)

    Returns:
        Tuple of (is_allowed, error_message)
    """
    # 1. Honeypot check (fastest, catches bots immediately)
    is_valid, error = validate_honeypot(honeypot)
    if not is_valid:
        return False, error

    # 2. Account requirements
    is_valid, error = check_account_requirements(user)
    if not is_valid:
        return False, error

    # 3. Rate limiting
    is_valid, error = check_rate_limit(db, user)
    if not is_valid:
        return False, error

    # 4. Content filtering
    is_valid, error = check_content(content, title)
    if not is_valid:
        return False, error

    return True, None

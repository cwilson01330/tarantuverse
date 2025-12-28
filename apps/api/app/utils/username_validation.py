"""
Username validation utility for blocking offensive/hateful usernames.

Checks usernames against a blocklist of slurs, hate terms, and profanity.
Includes leetspeak normalization to catch common substitutions.
"""

import re
from typing import Tuple

# Leetspeak character substitutions
LEETSPEAK_MAP = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '6': 'g',
    '7': 't',
    '8': 'b',
    '9': 'g',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '+': 't',
    '|': 'i',
    '(': 'c',
    '<': 'c',
    '}': 'j',
    '{': 'c',
    '€': 'e',
    '£': 'l',
}

# Blocklist of offensive terms (lowercase)
# This is a curated list - keep it focused on clear hate speech/slurs
# Generic profanity that isn't hateful may be allowed depending on platform policy
BLOCKED_TERMS = [
    # Racial slurs
    'nigger', 'nigga', 'negro', 'coon', 'darkie', 'spic', 'wetback',
    'beaner', 'chink', 'gook', 'slope', 'zipperhead', 'jap', 'paki',
    'raghead', 'towelhead', 'camel jockey', 'sandnigger', 'kike',
    'heeb', 'hymie', 'redskin', 'injun', 'squaw',

    # LGBTQ+ slurs
    'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'ladyboy',

    # Gendered slurs
    'cunt', 'twat', 'whore', 'slut', 'bitch',

    # Disability slurs
    'retard', 'retarded', 'tard', 'spaz', 'spastic',

    # Nazi/hate group references
    'nazi', 'hitler', 'heil', 'kkk', 'klan', 'aryan', 'skinhead',
    'whitepride', 'whitepower', 'sieg',

    # Violence/threats
    'killall', 'genocide', 'rapist', 'rape', 'molest', 'pedophile',
    'pedo', 'childlover',

    # Other offensive
    'terrorist', 'jihad', 'isis', 'alqaeda',
]

# Additional patterns that should be blocked (regex)
BLOCKED_PATTERNS = [
    r'n[i1!|]gg[e3]r',  # Common leetspeak for n-word
    r'f[a@4]gg?[o0]t',  # Common leetspeak for f-slur
    r'k[i1!|]k[e3]',    # Antisemitic slur
    r'h[i1!|]tl[e3]r',  # Hitler
    r'n[a@4]z[i1!|]',   # Nazi
    r'wh[i1!|]t[e3]p[o0]w[e3]r',  # White power
    r'r[e3]t[a@4]rd',   # R-word
]


def normalize_leetspeak(text: str) -> str:
    """
    Convert leetspeak characters to their letter equivalents.
    Example: 'h4t3r' -> 'hater'
    """
    result = text.lower()
    for leet, letter in LEETSPEAK_MAP.items():
        result = result.replace(leet, letter)
    return result


def remove_separators(text: str) -> str:
    """
    Remove common separators used to evade filters.
    Example: 'h.a.t.e' -> 'hate', 'h_a_t_e' -> 'hate'
    """
    return re.sub(r'[._\-\s]', '', text)


def check_blocked_terms(username: str) -> bool:
    """
    Check if username contains any blocked terms.
    Returns True if blocked term found, False if clean.
    """
    # Normalize the username
    normalized = normalize_leetspeak(username.lower())
    no_separators = remove_separators(normalized)

    # Check direct matches
    for term in BLOCKED_TERMS:
        if term in normalized or term in no_separators:
            return True

    # Check regex patterns
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            return True
        if re.search(pattern, no_separators, re.IGNORECASE):
            return True

    return False


def check_impersonation(username: str) -> bool:
    """
    Check for admin/moderator impersonation attempts.
    Returns True if impersonation detected, False if clean.
    """
    lower = username.lower()
    impersonation_terms = [
        'admin', 'administrator', 'moderator', 'mod',
        'staff', 'support', 'official', 'tarantuverse',
        'system', 'sysadmin', 'root', 'owner'
    ]

    for term in impersonation_terms:
        if term in lower:
            return True

    return False


def validate_username(username: str) -> Tuple[bool, str]:
    """
    Validate a username for offensive content.

    Returns:
        Tuple of (is_valid, error_message)
        - (True, "") if username is acceptable
        - (False, "error message") if username is blocked
    """
    if not username:
        return False, "Username is required"

    # Check length
    if len(username) < 3:
        return False, "Username must be at least 3 characters"

    if len(username) > 30:
        return False, "Username must be 30 characters or less"

    # Check for valid characters (alphanumeric and underscores only)
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return False, "Username can only contain letters, numbers, and underscores"

    # Check for offensive terms
    if check_blocked_terms(username):
        return False, "This username is not allowed"

    # Check for impersonation
    if check_impersonation(username):
        return False, "This username is not allowed"

    return True, ""

"""Automated test accounts — kept out of every user count and public listing.

WHY
---
Every Android upload to Google Play runs a "pre-launch report": Firebase Test
Lab installs the build on real devices and signs in with Google robot accounts
on @cloudtestlabaccounts.com. Each run creates real, verified users with empty
collections. They are harmless — ordinary free accounts with no more access
than any signup — but they inflated the admin signup numbers (the two newest
"signups" on 2026-09-30 were both robots).

Do NOT block these domains at registration: the pre-launch report is how
Google catches crashes before a release reaches keepers, and it needs to be
able to sign in.

HOW
---
`real_user_clause()` is a SQLAlchemy filter that excludes these accounts. Add
it to any query that COUNTS users or LISTS them publicly. The admin user list
keeps showing them (flagged with `is_test_account`) so nothing is hidden from
the admin.
"""
from typing import Optional

from sqlalchemy import and_, func

from app.models.user import User

# Lower-case, without the "@". Add a domain here and every count follows.
TEST_ACCOUNT_DOMAINS: tuple[str, ...] = (
    "cloudtestlabaccounts.com",  # Google Play pre-launch report / Firebase Test Lab
)


def is_test_account(email: Optional[str]) -> bool:
    if not email or "@" not in email:
        return False
    return email.rsplit("@", 1)[1].strip().lower() in TEST_ACCOUNT_DOMAINS


def real_user_clause(email_column=None):
    """Filter clause that keeps only real (non-test) users."""
    col = func.lower(email_column if email_column is not None else User.email)
    return and_(*[~col.like(f"%@{d}") for d in TEST_ACCOUNT_DOMAINS])


def test_user_clause(email_column=None):
    """The inverse: only the automated test accounts (for the admin count)."""
    return ~real_user_clause(email_column)

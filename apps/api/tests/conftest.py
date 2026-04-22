"""Pytest fixtures for the Tarantuverse / Herpetoverse API.

This is the first test-infrastructure checked in for this repo (Sprint 3
DoD per SPRINT-herpetoverse-v1.md). Design goals:

  1. **Real Postgres against real schema.** `num_nonnulls(...)` CHECK
     constraints and the shared `sex` / `source` DB enums don't exist in
     SQLite, so we don't fake them. Tests require a Postgres instance.

  2. **Hermetic per-test.** Each test runs inside a SAVEPOINT that rolls
     back before the next one starts. No data leaks between tests, and
     the test DB can be reused across runs without manual cleanup.

  3. **Cleanly skip when unconfigured.** If `TEST_DATABASE_URL` isn't set,
     the whole suite short-circuits with an explanation instead of
     exploding with a 500 from `get_db`. That keeps `pytest` from being
     a landmine on fresh clones.

Usage:
    export TEST_DATABASE_URL=postgresql://user:pass@localhost/tarantuverse_test
    cd apps/api
    alembic upgrade head          # once, against the test DB
    pytest

For CI: spin up a disposable Postgres (docker compose / service container),
run `alembic upgrade head` against it, then `pytest`.
"""
from __future__ import annotations

import os
import uuid
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")


# ── Hard skip when test DB unconfigured ───────────────────────────────────────

def pytest_collection_modifyitems(config, items):
    """If no test DB is wired up, skip the entire suite with a clear reason.

    Rather than let individual tests blow up on `get_db` calls, mark every
    collected test as skipped with an instructive message. Keeps the
    landmine-on-fresh-clone problem from happening.
    """
    if TEST_DATABASE_URL:
        return
    skip = pytest.mark.skip(
        reason=(
            "TEST_DATABASE_URL not set. Set it to a Postgres URL that has "
            "been migrated with `alembic upgrade head`. See tests/conftest.py."
        )
    )
    for item in items:
        item.add_marker(skip)


# ── Engine / session fixtures ────────────────────────────────────────────────

@pytest.fixture(scope="session")
def engine():
    """Shared engine for the whole test session."""
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not configured")
    return create_engine(TEST_DATABASE_URL, pool_pre_ping=True)


@pytest.fixture()
def db_session(engine) -> Iterator[Session]:
    """Per-test DB session wrapped in a SAVEPOINT.

    Pattern from the SQLAlchemy docs — an outer transaction is begun, the
    session joins it, and every commit from application code becomes a
    nested SAVEPOINT. At teardown we roll back the outer transaction so
    the next test sees a clean slate.
    """
    connection = engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(bind=connection, autoflush=False, autocommit=False)
    session = SessionLocal()

    # Start a SAVEPOINT so session.commit() inside the app code doesn't end
    # the outer transaction.
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess, trans):
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session) -> Iterator[TestClient]:
    """FastAPI TestClient with get_db overridden to the per-test session."""
    from app.main import app
    from app.database import get_db

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass  # session lifecycle owned by db_session fixture

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


# ── Auth fixtures ────────────────────────────────────────────────────────────

@pytest.fixture()
def test_user(db_session):
    """Create a fresh user row and return (user, raw_password)."""
    from app.models.user import User
    from app.utils.auth import get_password_hash

    raw_password = "TestPass1!"
    user = User(
        id=str(uuid.uuid4()),
        email=f"sprint3-{uuid.uuid4().hex[:8]}@test.local",
        username=f"sprint3_{uuid.uuid4().hex[:8]}",
        hashed_password=get_password_hash(raw_password),
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    return user, raw_password


@pytest.fixture()
def auth_headers(test_user) -> dict:
    """Return an Authorization header dict for the test user.

    Uses `create_access_token` directly rather than hitting `/auth/login`
    so tests don't depend on rate-limit state or login-path regressions.
    """
    from app.utils.auth import create_access_token

    user, _ = test_user
    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}

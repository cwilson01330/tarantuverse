"""The hourly digest cron hands freed memory back to the OS when it's done
(see tests/test_release_memory.py for why)."""
import pytest


@pytest.mark.requires_postgres
def test_digest_cron_releases_memory(client, db_session, monkeypatch):
    from app.routers import notifications

    calls = []
    monkeypatch.setattr(notifications, "release_memory", lambda: calls.append(1) or True)
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    r = client.post("/api/v1/notifications/run-digests", headers={"X-Cron-Secret": "s3cret"})
    assert r.status_code == 200, r.text
    assert calls == [1]

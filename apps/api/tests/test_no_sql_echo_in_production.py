"""Production must never log SQL statements with their parameters.

Found 2026-10-26 in Render's logs: `Settings.DEBUG` defaulted to True and the
engine was created with `echo=settings.DEBUG`, so with no DEBUG variable on
Render every query was logged with its bound values — keepers' email
addresses at login, message text, notes, anything the API wrote or looked up.

DEBUG is now off unless set, and even with DEBUG on the engine only echoes in
the development environment.
"""
from __future__ import annotations

from app.config import Settings
from app.database import engine_echo


def test_debug_is_off_unless_set(monkeypatch):
    monkeypatch.delenv("DEBUG", raising=False)
    assert Settings(_env_file=None).DEBUG is False


def test_engine_never_echoes_outside_development():
    assert engine_echo(debug=True, environment="production") is False
    assert engine_echo(debug=True, environment="staging") is False
    assert engine_echo(debug=False, environment="production") is False


def test_engine_echo_still_available_for_local_development():
    assert engine_echo(debug=True, environment="development") is True
    assert engine_echo(debug=False, environment="development") is False

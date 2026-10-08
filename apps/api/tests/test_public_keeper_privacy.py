"""Public keeper routes never expose account data or private animal records
(fresh audit 2026-10-08: the directory returned every public keeper's email)."""
import inspect

from app.routers import keepers
from app.schemas.user import PublicKeeperResponse


def test_public_keeper_schema_has_no_account_data():
    fields = set(PublicKeeperResponse.model_fields)
    for secret in ("email", "is_admin", "is_superuser", "is_premium", "is_verified",
                   "hashed_password", "oauth_access_token", "measurement_units"):
        assert secret not in fields


def test_public_routes_use_the_public_schema():
    paths = {r.path: r for r in keepers.router.routes}
    assert paths["/"].response_model.__args__[0] is PublicKeeperResponse
    assert paths["/{username}/"].response_model is PublicKeeperResponse
    assert "UserResponse" not in inspect.getsource(keepers)


def test_visitors_never_see_private_animal_records():
    for f in ("price_paid", "source", "notes", "enclosure_notes", "death_notes", "location"):
        assert keepers.PRIVATE_ANIMAL_FIELDS_CLEARED[f] is None
    src = inspect.getsource(keepers.get_keeper_collection)
    assert "PRIVATE_ANIMAL_FIELDS_CLEARED" in src and "if is_own_profile" in src


def test_public_animal_link_never_returns_molt_notes():
    import inspect
    from app.routers import tarantulas
    src = inspect.getsource(tarantulas)
    assert '"notes": molt.notes' not in src


def test_starting_count_replays_first_whatever_its_date():
    """A US keeper creates a colony at 9 pm and logs a death the same evening:
    the UTC-dated starting count must still come first (audit-2 review S1)."""
    from datetime import date
    from types import SimpleNamespace as NS
    from app.services import colony_history_service as h
    from app.utils.colony_counts import STARTING_COUNT_NOTE
    start = NS(event_type="added", notes=STARTING_COUNT_NOTE, stage="adults", count_delta=10,
               occurred_at=date(2026, 10, 9), created_at=None)
    death = NS(event_type="death", notes=None, stage="adults", count_delta=-2,
               occurred_at=date(2026, 10, 8), created_at=None)
    ordered = sorted([death, start], key=lambda e: 0 if h._is_starting_count(e) else 1)
    assert ordered[0] is start

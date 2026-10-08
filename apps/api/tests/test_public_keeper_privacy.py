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

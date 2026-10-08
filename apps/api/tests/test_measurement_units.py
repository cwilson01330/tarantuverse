"""Per-keeper measurement units (U1).

Pins: the helper rounding rules every client copies, the round trips that
must not drift, the region default, the migration/model agreement, and the
self-update route's validation. Storage never changes -- these are display
helpers only.
"""
import asyncio
import importlib.util
import inspect
import pathlib
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.user import MEASUREMENT_UNITS, User
from app.routers import auth
from app.schemas.user import UserProfileUpdate, UserResponse
from app.utils import units as u


# ── helpers: rounding rules ──────────────────────────────────────────────────

def test_lengths_in_inches_trim_to_two_decimals():
    assert u.format_length(3.5, "imperial") == "3.5 in"
    assert u.format_length(3.25, "imperial") == "3.25 in"
    assert u.format_length(4, "imperial") == "4 in"
    assert u.format_length(3.456, "imperial") == "3.46 in"


def test_lengths_in_cm_have_one_decimal():
    assert u.format_length(3.5, "metric") == "8.9 cm"
    assert u.format_length(1, "metric") == "2.5 cm"
    assert u.format_length(10, "metric") == "25.4 cm"


def test_mm_fields_show_mm_or_inches():
    assert u.format_length_mm(45, "metric") == "45 mm"
    assert u.format_length_mm(45.5, "metric") == "45.5 mm"
    assert u.format_length_mm(45, "imperial") == "1.77 in"
    assert u.format_length_mm_range(40, 60, "metric") == "40–60 mm"
    assert u.format_length_mm_range(None, 60, "imperial") == "?–2.36 in"


def test_temperatures_are_whole_degrees():
    assert u.format_temp(75, "imperial") == "75°F"
    assert u.format_temp(75, "metric") == "24°C"
    assert u.format_temp(32, "metric") == "0°C"
    assert u.format_temp_range(72, 82, "metric") == "22–28°C"
    assert u.format_temp_range(72, None, "imperial") == "72–?°F"
    assert u.format_temp_range(None, None, "metric") is None


def test_missing_values_stay_missing():
    assert u.format_length(None, "metric") is None
    assert u.format_length_mm(None, "imperial") is None
    assert u.format_temp(None, "metric") is None


def test_unknown_units_fall_back_to_imperial_which_is_storage():
    assert u.normalize_units(None) == "imperial"
    assert u.normalize_units("furlongs") == "imperial"
    assert u.format_length(3.5, None) == "3.5 in"


# ── parsing and round trips ─────────────────────────────────────────────────

def test_parse_inputs_convert_to_storage_units():
    assert u.parse_length_input("8.9", "metric") == 3.5
    assert u.parse_length_input("3.5", "imperial") == 3.5
    assert u.parse_length_mm_input("1.77", "imperial") == 44.96
    assert u.parse_length_mm_input("45", "metric") == 45.0
    assert u.parse_temp_input("24", "metric") == 75.2
    assert u.parse_temp_input("75", "imperial") == 75.0
    assert u.parse_temp_input("3,5", "imperial") == 3.5   # comma decimals
    assert u.parse_length_input("", "metric") is None
    assert u.parse_length_input("abc", "metric") is None
    assert u.parse_length_input("-1", "imperial") is None
    assert u.parse_temp_input("-5", "metric") == 23.0


def test_growth_rates_keep_two_decimals_in_cm():
    assert u.format_length_rate(0.25, "imperial") == "0.25 in/mo"
    assert u.format_length_rate(0.25, "metric") == "0.64 cm/mo"
    assert u.format_length_rate(None, "metric") is None


@pytest.mark.parametrize("cm_tenths", range(1, 400))
def test_cm_round_trips_through_inch_storage(cm_tenths):
    """Typed cm -> stored inches (2 dp) -> shown cm is what was typed."""
    typed = cm_tenths / 10
    stored = u.parse_length_input(str(typed), "metric")
    assert float(u.length_value(stored, "metric")) == pytest.approx(typed)


@pytest.mark.parametrize("c", range(-10, 50))
def test_whole_celsius_round_trips_through_fahrenheit_storage(c):
    stored = u.parse_temp_input(str(c), "metric")
    assert u.temp_value(stored, "metric") == str(c)


def test_region_default():
    for region in ("US", "us", "LR", "MM"):
        assert u.default_units_for_region(region) == "imperial"
    for region in ("GB", "CA", "DE", "AU", "NL"):
        assert u.default_units_for_region(region) == "metric"
    assert u.default_units_for_region(None) == "imperial"


# ── migration + model ────────────────────────────────────────────────────────

def _migration():
    path = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "unt_20261008_measurement_units.py"
    spec = importlib.util.spec_from_file_location("unt_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_chains_from_colony_transfers_and_is_the_only_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    root = pathlib.Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    script = ScriptDirectory.from_config(cfg)
    m = _migration()
    assert m.revision == "unt_20261008_measurement_units"
    assert m.down_revision == "ctr_20261008_colony_transfers"
    assert len(script.get_heads()) == 1
    assert m.revision in {r.revision for r in script.walk_revisions()}


def test_migration_adds_a_nullable_column_and_the_check_and_reverses_both():
    m = _migration()
    up, down = inspect.getsource(m.upgrade), inspect.getsource(m.downgrade)
    assert '"measurement_units"' in up and '"measurement_units"' in down
    assert "nullable=True" in up
    assert "create_check_constraint" in up and "drop_constraint" in down
    for value in MEASUREMENT_UNITS:
        assert f"'{value}'" in m.PREDICATE


def test_model_mirrors_the_migration():
    col = User.__table__.c.measurement_units
    assert col.nullable and col.type.length == 10
    check = [c for c in User.__table__.constraints if getattr(c, "name", None) == "users_measurement_units_check"]
    assert check and str(check[0].sqltext) == _migration().PREDICATE
    assert set(MEASUREMENT_UNITS) == {"imperial", "metric"}


# ── schemas + route ──────────────────────────────────────────────────────────

def test_me_response_carries_the_setting_as_optional():
    assert UserResponse.model_fields["measurement_units"].is_required() is False


def test_profile_update_accepts_only_the_two_values():
    assert UserProfileUpdate(measurement_units="metric").measurement_units == "metric"
    assert UserProfileUpdate(measurement_units="imperial").measurement_units == "imperial"
    with pytest.raises(ValidationError):
        UserProfileUpdate(measurement_units="kelvin")


class _DB:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass


def _user(**k):
    import uuid
    from datetime import datetime, timezone
    base = dict(
        id=uuid.uuid4(), email="k@example.com", username="keeper", display_name=None,
        avatar_url=None, bio=None, created_at=datetime.now(timezone.utc),
        collection_visibility="private", measurement_units=None,
    )
    base.update(k)
    return NS(**base)


def test_route_saves_the_choice():
    user, db = _user(), _DB()
    out = asyncio.run(auth.update_profile(UserProfileUpdate(measurement_units="metric"), current_user=user, db=db))
    assert user.measurement_units == "metric"
    assert out.measurement_units == "metric"
    assert db.commits == 1


def test_route_refuses_an_explicit_null_and_writes_nothing():
    user, db = _user(measurement_units="metric"), _DB()
    with pytest.raises(HTTPException) as e:
        asyncio.run(auth.update_profile(UserProfileUpdate(measurement_units=None), current_user=user, db=db))
    assert e.value.status_code == 400
    assert user.measurement_units == "metric"
    assert db.commits == 0


def test_route_leaves_the_setting_alone_when_not_sent():
    user, db = _user(measurement_units="metric"), _DB()
    asyncio.run(auth.update_profile(UserProfileUpdate(display_name="K"), current_user=user, db=db))
    assert user.measurement_units == "metric"


# ── exports say their units ──────────────────────────────────────────────────

def test_exports_state_their_storage_units():
    from app.services import export_service as es

    for readme in (es._CSV_ZIP_README, es._FULL_ZIP_README):
        assert "inches" in readme and "Fahrenheit" in readme and "grams" in readme
        assert "_mm" in readme
    assert "units" in inspect.getsource(es.ExportService.export_json)
    assert "measurement_units" in es.USER_PROFILE_FIELDS


# ── sitter care card follows the keeper's units ─────────────────────────────

def _colony_for_card(**k):
    base = dict(id="c1", name="Dairy cows", common_name=None, scientific_name="Porcellio laevis",
                taxon="isopod", photo_url=None, water_dish=None, target_humidity_min=None,
                target_humidity_max=None, target_temp_min=72, target_temp_max=82, sitter_note=None)
    base.update(k)
    return NS(**base)


def _heat_text(card):
    return [line["text"] for s in card["sections"] if s["key"] == "heat" for line in s["lines"]]


def test_sitter_card_temperatures_follow_the_keepers_units():
    from app.services.sitter_card import compose_colony_card

    col = _colony_for_card()
    assert _heat_text(compose_colony_card(col, None, keeper_name="Cory")) == [
        "Room or enclosure should read 72–82°F."
    ]
    assert _heat_text(compose_colony_card(col, None, keeper_name="Cory", units="imperial")) == [
        "Room or enclosure should read 72–82°F."
    ]
    assert _heat_text(compose_colony_card(col, None, keeper_name="Cory", units="metric")) == [
        "Room or enclosure should read 22–28°C."
    ]


def test_sitter_router_passes_the_owners_units():
    from app.routers import sitter_passes

    src = inspect.getsource(sitter_passes)
    assert 'keeper_units = getattr(owner, "measurement_units", None)' in src
    assert src.count("units=keeper_units") == 3

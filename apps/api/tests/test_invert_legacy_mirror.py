"""Reverse dual-write invariants: inverts → legacy tables.

Reported by a keeper 2026-07-29: she renamed a communal from "Communal of 6" to
"Communal of 11". The detail screen showed the new name; the collection card
kept showing the old one.

Cause: `GET /tarantulas/` still reads the legacy `tarantulas` table (the ADR-005
C1 read cutover hasn't happened), but ADR-013 merged the detail screens so every
tarantula edit now arrives at `PUT /inverts/{id}`. All thirteen existing mirror
functions run legacy → inverts. Nothing ran the other way, so the legacy row —
the one the collection actually displays — went stale on the first edit and
stayed stale.

Name was only the visible symptom. Sex, species, husbandry and notes diverged
identically, and delete was worse: removing the invert row left the legacy row
behind, so the animal appeared not to delete at all.

These tests are unit-level over a stub row — the mirror functions take a Session
but only use it for `query(...).filter(...).first()`, so a fake covers the
mapping logic without a database. The end-to-end behaviour is covered by the
requires_postgres suites.
"""
from types import SimpleNamespace

import pytest

from app.services.inverts_dualwrite import (
    _LEGACY_MODEL_BY_TAXON,
    _REVERSE_SHARED_FIELDS,
)


def test_taxa_without_a_legacy_table_are_not_mirrored():
    """Centipedes, mantises, roaches and the rest were born on `inverts` and
    have no legacy twin. Mirroring them would be a no-op at best and an
    AttributeError at worst."""
    for taxon in ("centipede", "whip_spider", "vinegaroon", "true_spider",
                  "millipede", "mantis", "roach", "other"):
        assert taxon not in _LEGACY_MODEL_BY_TAXON

    # The two that DO still back a read path.
    assert set(_LEGACY_MODEL_BY_TAXON) == {"tarantula", "scorpion"}


def test_species_id_is_never_mirrored_backwards():
    """The two surfaces reference different catalogs — `species` for legacy
    tarantulas, `invert_species` for inverts. Copying the id across would point
    a tarantula at a row in the wrong table."""
    assert "species_id" not in _REVERSE_SHARED_FIELDS


def test_immutable_identity_columns_are_never_mirrored():
    for field in ("id", "user_id", "taxon"):
        assert field not in _REVERSE_SHARED_FIELDS


def test_reported_symptom_name_is_in_the_mirrored_set():
    """The field the keeper actually noticed."""
    assert "name" in _REVERSE_SHARED_FIELDS


@pytest.mark.parametrize(
    "field",
    [
        # Everything else that was silently diverging on every edit.
        "common_name", "scientific_name", "sex", "date_acquired", "source",
        "price_paid", "substrate_type", "substrate_depth",
        "last_substrate_change", "target_temp_min", "target_temp_max",
        "target_humidity_min", "target_humidity_max", "water_dish",
        "misting_schedule", "last_enclosure_cleaning", "enclosure_notes",
        "feeding_paused_reason", "feeding_paused_until", "photo_url", "notes",
    ],
)
def test_shared_husbandry_fields_are_mirrored(field):
    assert field in _REVERSE_SHARED_FIELDS


def test_mirror_update_no_ops_for_invert_native_taxa():
    """A centipede has no legacy row; the function must return without
    touching the session."""
    from app.services.inverts_dualwrite import mirror_invert_update_to_legacy

    class ExplodingSession:
        def query(self, *a, **kw):  # pragma: no cover - must never be reached
            raise AssertionError("should not query for an invert-native taxon")

    mirror_invert_update_to_legacy(
        ExplodingSession(), SimpleNamespace(taxon="centipede", id="x")
    )


def test_mirror_delete_no_ops_for_invert_native_taxa():
    from app.services.inverts_dualwrite import mirror_invert_delete_to_legacy

    class ExplodingSession:
        def query(self, *a, **kw):  # pragma: no cover
            raise AssertionError("should not query for an invert-native taxon")

    mirror_invert_delete_to_legacy(
        ExplodingSession(), SimpleNamespace(taxon="mantis", id="x")
    )

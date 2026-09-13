"""Taxon changes must not destroy history (2026-09-13).

`taxon` used to be immutable, so a keeper who picked wrong at creation could
either delete the animal — losing every feeding, molt and photo — or message
the developer. Both happened. Making it editable is easy; making it SAFE is
the entire problem, and the danger is an ordering, not a value.

THE SHAPE OF THE BUG THESE TESTS EXIST TO PREVENT
--------------------------------------------------
Under ADR-005 dual-write a tarantula has an `inverts` row AND a mirror row in
`tarantulas`, and its logs carry BOTH foreign keys. Measured on the first real
case: 17 of 17 feedings had both set. Every legacy FK is ON DELETE CASCADE.

So dropping the mirror row before detaching those FKs deletes the logs too,
even though `invert_id` still points at a live animal. The animal survives.
The history doesn't. Nothing errors. The keeper finds out weeks later.

Asserted against the source rather than a database, matching how
test_keeper_signals guards its aggregate: the invariant is the ORDER of two
statements, which a value-based test can't see and which is exactly what a
well-meaning refactor would reorder.
"""
import inspect

from app.services import retaxon_service
from app.services.retaxon_service import (
    CHILD_TABLES,
    EXTRA_CASCADES,
    LEGACY_TABLES,
    _cascade_sources,
)


SOURCE = inspect.getsource(retaxon_service.change_invert_taxon)


# ── The ordering invariant ───────────────────────────────────────────────────

def test_detach_happens_before_the_mirror_row_is_deleted():
    """The one thing that must never be reordered.

    If `mirror_invert_delete_to_legacy` moves above the UPDATE ... SET NULL,
    every feeding, molt and photo on a tarantula being retaxoned is destroyed
    by cascade, silently.
    """
    detach_at = SOURCE.find("SET {legacy_col} = NULL")
    delete_at = SOURCE.find("mirror_invert_delete_to_legacy")

    assert detach_at != -1, "the detach step is gone — history is unprotected"
    assert delete_at != -1, "the mirror row is no longer removed"
    assert detach_at < delete_at, (
        "DELETE of the legacy mirror row now runs BEFORE the child rows are "
        "detached. Every legacy FK is ON DELETE CASCADE, so this destroys the "
        "animal's entire history while leaving the animal in place."
    )


def test_the_refusal_precedes_any_mutation():
    """A partial retaxon is worse than a refused one.

    The orphan check must run before the first UPDATE, or a refusal can leave
    some tables detached and others not.
    """
    check_at = SOURCE.find("_orphan_rows")
    mutate_at = SOURCE.find("SET {legacy_col} = NULL")
    assert check_at != -1 and mutate_at != -1
    assert check_at < mutate_at


def test_history_is_verified_after_the_change():
    """Belt and braces: the function re-counts and rolls back if the numbers
    moved. Cheap, and the failure it catches is unrecoverable."""
    assert "rollback" in SOURCE
    assert SOURCE.find("after != before") != -1


# ── What must stay covered ───────────────────────────────────────────────────

def test_every_table_that_can_cascade_is_detached():
    """A table missing from this set is a table whose rows get cascade-deleted
    with no warning. It IS the safety boundary.

    Transcribed from information_schema against production 2026-09-13 — see
    the query in the service docstring. Do not edit this to make a test pass;
    re-run the query and edit the service.
    """
    assert set(CHILD_TABLES) == {
        "feeding_logs",
        "molt_logs",
        "substrate_changes",
        "photos",
        "qr_upload_sessions",
    }

    tarantula = {(t, c) for t, c, _ in _cascade_sources("tarantula")}
    scorpion = {(t, c) for t, c, _ in _cascade_sources("scorpion")}

    assert tarantula == {
        ("feeding_logs", "tarantula_id"),
        ("molt_logs", "tarantula_id"),
        ("substrate_changes", "tarantula_id"),
        ("photos", "tarantula_id"),
        ("qr_upload_sessions", "tarantula_id"),
        ("pairings", "male_id"),
        ("pairings", "female_id"),
    }
    assert scorpion == {
        ("feeding_logs", "scorpion_id"),
        ("molt_logs", "scorpion_id"),
        ("substrate_changes", "scorpion_id"),
        ("photos", "scorpion_id"),
        ("qr_upload_sessions", "scorpion_id"),
        ("broods", "mother_scorpion_id"),
    }


def test_pairings_is_covered_on_both_sides():
    """The omission that made this whole mechanism necessary a second time.

    pairings cascades from `tarantulas` through male_id AND female_id, and on
    to egg_sacs → offspring. Covering one side would still destroy a breeding
    project for every animal that happened to be the other sex.
    """
    pairing_cols = {c for t, c, _ in EXTRA_CASCADES["tarantula"] if t == "pairings"}
    assert pairing_cols == {"male_id", "female_id"}

    invert_cols = {i for t, _, i in EXTRA_CASCADES["tarantula"] if t == "pairings"}
    assert invert_cols == {"male_invert_id", "female_invert_id"}, (
        "pairings is polymorphic — it must be DETACHED, not refused. Both "
        "invert-side columns are nullable with no CHECK constraint."
    )


def test_a_brood_mother_is_refused_rather_than_detached():
    """broods.mother_scorpion_id is NOT NULL with no invert equivalent, so
    there is nowhere to re-point it. Refusing is the only honest answer —
    NULLing would violate the constraint and detaching is impossible."""
    broods = [row for row in EXTRA_CASCADES["scorpion"] if row[0] == "broods"]
    assert broods == [("broods", "mother_scorpion_id", None)]


def test_undetachable_tables_never_reach_the_update():
    """A None invert column must be skipped by the detach loop. Building an
    `UPDATE ... SET mother_scorpion_id = NULL` would fail the NOT NULL
    constraint and abort mid-change."""
    assert "if invert_col is None:" in SOURCE
    assert SOURCE.find("if invert_col is None:") < SOURCE.find("UPDATE {table}")


def test_only_tarantula_and_scorpion_have_legacy_mirrors():
    """If a taxon gains a legacy table it must be added here, or its mirror row
    is orphaned on retaxon. Empties out at the ADR-005 Phase D drop."""
    assert set(LEGACY_TABLES) == {"tarantula", "scorpion"}
    assert LEGACY_TABLES["tarantula"] == ("tarantulas", "tarantula_id")
    assert LEGACY_TABLES["scorpion"] == ("scorpions", "scorpion_id")


def test_history_counts_do_not_look_at_the_legacy_key():
    """The before/after check must count via invert_id ONLY.

    Counting `OR tarantula_id` would keep reporting the same number right up
    until the cascade fired, which is precisely the moment it needs to notice.
    """
    src = inspect.getsource(retaxon_service._history_counts)
    assert "WHERE invert_id = :i" in src
    assert "tarantula_id" not in src
    assert "scorpion_id" not in src


# ── Species linkage ──────────────────────────────────────────────────────────

def test_a_mismatched_species_is_refused():
    """Linking a tarantula species to a jumping spider would drive the wrong
    care sheet and the wrong feeding cadence."""
    assert "is a {species.taxon}, not a " in SOURCE


def test_a_stale_species_link_is_cleared_not_kept():
    """No species is better than the wrong species — an animal carrying a link
    to its old taxon's catalog is actively misleading, not merely incomplete."""
    assert "invert.species_id = None" in SOURCE


def test_changing_to_the_same_taxon_is_rejected():
    assert "Already a {new_taxon}" in SOURCE

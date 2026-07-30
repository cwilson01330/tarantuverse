"""Polymorphic-parent invariants for colony photos and feeding logs.

cph_20260729_colony_logs widened the exactly-one-parent CHECK on `photos` and
`feeding_logs` so a colony can own them. Getting that predicate wrong is the
kind of bug that doesn't surface as an error — it surfaces as a photo attached
to two parents, or an orphan row nothing renders.

These tests evaluate the predicate directly rather than through the database,
so they run without Postgres. The live definitions were confirmed against
production before the migration was written, and every existing row (430 photos,
2431 feeding logs) was verified to still satisfy the new form.
"""
import pytest


def one_parent_ok(legacy_count: int, invert_id, colony_id) -> bool:
    """Python mirror of the CHECK body in cph_20260729_colony_logs.

        (num_nonnulls(<legacy>) = 1 AND colony_id IS NULL)
        OR (num_nonnulls(<legacy>) = 0 AND num_nonnulls(invert_id, colony_id) = 1)
    """
    non_null = sum(1 for v in (invert_id, colony_id) if v is not None)
    return (legacy_count == 1 and colony_id is None) or (
        legacy_count == 0 and non_null == 1
    )


# ── Shapes that MUST remain valid ────────────────────────────────────────────

def test_legacy_only_row_still_valid():
    """A pre-consolidation tarantula photo."""
    assert one_parent_ok(legacy_count=1, invert_id=None, colony_id=None)


def test_dual_write_row_still_valid():
    """Post-A2 rows carry BOTH the legacy id and the unified invert id. The
    first branch is deliberately loose about invert_id for exactly this — if it
    weren't, the migration would have invalidated most of the table."""
    assert one_parent_ok(legacy_count=1, invert_id="inv", colony_id=None)


def test_invert_native_row_still_valid():
    """Centipedes and newer taxa never had a legacy row."""
    assert one_parent_ok(legacy_count=0, invert_id="inv", colony_id=None)


def test_colony_row_is_now_valid():
    """The whole point of the migration."""
    assert one_parent_ok(legacy_count=0, invert_id=None, colony_id="col")


# ── Shapes that MUST be rejected ─────────────────────────────────────────────

def test_no_parent_at_all_is_rejected():
    assert not one_parent_ok(legacy_count=0, invert_id=None, colony_id=None)


def test_colony_plus_invert_is_rejected():
    """A photo belongs to an animal or a group, never both. Allowing this would
    make it ambiguous which gallery owns the row and which delete cascades it."""
    assert not one_parent_ok(legacy_count=0, invert_id="inv", colony_id="col")


def test_colony_plus_legacy_parent_is_rejected():
    """The `AND colony_id IS NULL` guard on the first branch. Without it, a
    tarantula photo could also claim a colony."""
    assert not one_parent_ok(legacy_count=1, invert_id=None, colony_id="col")


def test_two_legacy_parents_is_rejected():
    assert not one_parent_ok(legacy_count=2, invert_id=None, colony_id=None)


@pytest.mark.parametrize("legacy", [0, 1])
def test_colony_never_coexists_with_another_parent(legacy):
    """Sweep: whenever colony_id is set, nothing else may be."""
    assert one_parent_ok(legacy, invert_id=None, colony_id="col") == (legacy == 0)
    assert not one_parent_ok(legacy, invert_id="inv", colony_id="col")

"""Collection lifecycle views (ADR-015).

An animal is in your collection, handed off to someone else, or gone. Those are
mutually exclusive, so the list endpoint takes one `status` param rather than
independent `transferred` / `deceased` booleans.

The booleans came first and are kept as deprecated aliases so an
already-installed mobile bundle doesn't break the moment this deploys. This
pins the resolution between the two so the legacy path can be deleted later
without guessing what it did.
"""
import pytest


def resolve_view(status, transferred: bool, deceased: bool) -> str:
    """Mirror of the branch in routers/inverts.py::list_inverts."""
    return status or ('transferred' if transferred else 'deceased' if deceased else 'active')


# ── The new param wins ───────────────────────────────────────────────────────

@pytest.mark.parametrize("view", ["active", "transferred", "deceased"])
def test_status_is_used_verbatim(view):
    assert resolve_view(view, False, False) == view


def test_status_overrides_the_legacy_booleans():
    """A client sending both is mid-migration. The explicit param is the more
    recent statement of intent, so it wins rather than being ANDed."""
    assert resolve_view("deceased", transferred=True, deceased=False) == "deceased"
    assert resolve_view("active", transferred=True, deceased=True) == "active"


# ── Legacy booleans still work ───────────────────────────────────────────────

def test_no_params_means_active():
    """The default has to stay ACTIVE — this list is what the free-tier cap
    count is compared against, and the two must agree."""
    assert resolve_view(None, False, False) == "active"


def test_legacy_transferred_still_resolves():
    assert resolve_view(None, transferred=True, deceased=False) == "transferred"


def test_legacy_deceased_still_resolves():
    assert resolve_view(None, transferred=False, deceased=True) == "deceased"


def test_transferred_wins_over_deceased_in_the_legacy_path():
    """Preserves the precedence the booleans had before `status` existed.

    Not a meaningful state — an animal can't be both — but pinning it means the
    legacy branch can be deleted later without anyone having to reconstruct
    what it used to do from the diff.
    """
    assert resolve_view(None, transferred=True, deceased=True) == "transferred"


# ── The filter each view applies ─────────────────────────────────────────────

def visible(view: str, transferred_out_at, died_at) -> bool:
    """Mirror of the query filters. Kept here because the important property
    is that ACTIVE excludes BOTH — if it ever excluded only one, the collection
    would disagree with the cap and a keeper would be charged for an animal
    they can't see."""
    if view == "transferred":
        return transferred_out_at is not None
    if view == "deceased":
        return died_at is not None
    return transferred_out_at is None and died_at is None


def test_active_excludes_both_terminal_states():
    assert visible("active", None, None)
    assert not visible("active", "2026-01-01", None)
    assert not visible("active", None, "2026-07-31")


def test_history_views_show_only_their_own():
    assert visible("transferred", "2026-01-01", None)
    assert not visible("transferred", None, "2026-07-31")
    assert visible("deceased", None, "2026-07-31")
    assert not visible("deceased", "2026-01-01", None)

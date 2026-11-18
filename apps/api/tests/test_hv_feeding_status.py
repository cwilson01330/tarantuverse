"""HV feeding status on the shared due-date core (HV day one, Task 2).

Herpetoverse's three due/overdue surfaces used to run three different rules:
the Feeding Day board (`GET /animals/feeding-status`), the per-animal status
(`GET /animals/{id}/feeding-status`, a min/max window) and the daily digest
(`digest_service._animal_overdue_count`). They now all go through
`services/animal_feeding_status.compute_animal_feeding_status`, which calls the
same pure core TV uses (`services/feeding_rule.decide`). These tests pin:

- the first-feeding rule with HV's own release cutoff
  (`HV_FIRST_FEEDING_DUE_FROM`, moved here with monkeypatch);
- plant-eaters (linked species `diet_type == "herbivore"`) have no schedule
  unless the keeper set an interval;
- brumation and the keeper's pause behave as before;
- the board, the per-animal status and the digest agree on every animal;
- "refusal restarts the wait" (the owner's switch) applies to HV animals.

Real Postgres through the TestClient; animals/logs via public routes.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.models.animal import Animal
from app.models.notification_preferences import NotificationPreferences
from app.models.reptile_species import ReptileSpecies
from app.models.user import User
from app.services import animal_feeding_status, digest_service
from app.utils.auth import create_access_token

pytestmark = pytest.mark.requires_postgres

BOARD = "/api/v1/animals/feeding-status"

AFTER_CUTOFF = date(2020, 1, 1)   # every animal in these tests is created after it
BEFORE_CUTOFF = date(2099, 1, 1)  # every animal in these tests is created before it


# ── helpers ──────────────────────────────────────────────────────────────────

def _now():
    return datetime.now(timezone.utc)


def mk_user(db, tag="hvfeed"):
    u = User(
        id=uuid.uuid4(),
        email=f"{tag}-{uuid.uuid4().hex[:8]}@test.local",
        username=f"{tag}_{uuid.uuid4().hex[:8]}",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    db.commit()
    return u


def hdr(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


@pytest.fixture()
def keeper(db_session):
    return mk_user(db_session)


@pytest.fixture()
def h(keeper):
    return hdr(keeper)


@pytest.fixture()
def after_cutoff(monkeypatch):
    monkeypatch.setattr(animal_feeding_status, "HV_FIRST_FEEDING_DUE_FROM", AFTER_CUTOFF)


@pytest.fixture()
def before_cutoff(monkeypatch):
    monkeypatch.setattr(animal_feeding_status, "HV_FIRST_FEEDING_DUE_FROM", BEFORE_CUTOFF)


def hv_animal(client, headers, name, *, taxon="snake", interval=7, **extra):
    body = {"taxon": taxon, "name": name, **extra}
    if interval is not None:
        body["feeding_interval_days"] = interval
    r = client.post("/api/v1/animals/", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def created_days_ago(db, animal_id, days):
    """Move created_at to NOON UTC, `days` calendar days before today (UTC)."""
    stamp = datetime.combine(_now().date() - timedelta(days=days), time(12, 0), tzinfo=timezone.utc)
    a = db.query(Animal).filter(Animal.id == uuid.UUID(animal_id)).one()
    a.created_at = stamp
    db.commit()


def set_cols(db, animal_id, **cols):
    a = db.query(Animal).filter(Animal.id == uuid.UUID(animal_id)).one()
    for k, v in cols.items():
        setattr(a, k, v)
    db.commit()


def feed(client, headers, animal_id, days_ago, accepted=True):
    when = _now() - timedelta(days=days_ago, hours=1)
    body = {"fed_at": when.isoformat(), "accepted": accepted}
    if accepted:
        body["food_type"] = "mouse"
    r = client.post(f"/api/v1/animals/{animal_id}/feedings", json=body, headers=headers)
    assert r.status_code == 201, r.text


def board(client, headers, animal_id):
    r = client.get(BOARD, headers=headers)
    assert r.status_code == 200, r.text
    return next(i for i in r.json() if i["id"] == animal_id)


def detail(client, headers, animal_id):
    r = client.get(f"/api/v1/animals/{animal_id}/feeding-status", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def digest_count(db, user):
    return digest_service._animal_overdue_count(db, user.id, None)


def set_rules(db, user, *, refusal=False):
    row = db.query(NotificationPreferences).filter(NotificationPreferences.user_id == user.id).first()
    if row is None:
        row = NotificationPreferences(user_id=user.id)
        db.add(row)
    row.refusal_restarts_wait = refusal
    db.commit()


def species(db, *, diet, name=None, taxon="lizard", freq="Daily"):
    sci = name or f"Uromastyx testi {uuid.uuid4().hex[:6]}"
    sp = ReptileSpecies(
        id=uuid.uuid4(),
        scientific_name=sci,
        scientific_name_lower=sci.lower(),
        slug=f"sp-{uuid.uuid4().hex[:10]}",
        taxon=taxon,
        diet_type=diet,
        feeding_frequency_adult=freq,
    )
    db.add(sp)
    db.commit()
    return sp


# ── first feeding, HV cutoff ────────────────────────────────────────────────

def test_hv_never_fed_before_cutoff_never_due_anywhere(client, db_session, keeper, h, before_cutoff):
    a = hv_animal(client, h, "Old Timer")
    created_days_ago(db_session, a["id"], 30)

    s = board(client, h, a["id"])
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is True
    assert s["days_since_baseline"] == 30

    d = detail(client, h, a["id"])
    assert d["status"] not in ("due", "overdue")
    assert d["status"] == "no_feedings"

    assert digest_count(db_session, keeper) == 0


def test_hv_never_fed_after_cutoff_due_after_interval(client, db_session, keeper, h, after_cutoff):
    a = hv_animal(client, h, "New Arrival")
    created_days_ago(db_session, a["id"], 3)
    s = board(client, h, a["id"])
    assert s["needs_first_feeding"] is True
    assert s["is_overdue"] is False
    assert s["days_since_baseline"] == 3
    assert detail(client, h, a["id"])["status"] == "no_feedings"
    assert digest_count(db_session, keeper) == 0

    created_days_ago(db_session, a["id"], 7)
    s = board(client, h, a["id"])
    assert s["is_overdue"] is True
    assert s["needs_first_feeding"] is False
    d = detail(client, h, a["id"])
    assert d["status"] == "due"  # exactly the interval: due today, not "overdue"
    assert d["days_until_due"] == 0
    assert digest_count(db_session, keeper) == 1

    created_days_ago(db_session, a["id"], 8)
    d = detail(client, h, a["id"])
    assert d["status"] == "overdue"
    assert d["days_until_due"] == -1


def test_hv_baseline_uses_date_acquired_when_later(client, db_session, keeper, h, after_cutoff):
    a = hv_animal(client, h, "Bought Later")
    created_days_ago(db_session, a["id"], 20)
    set_cols(db_session, a["id"], date_acquired=_now().date() - timedelta(days=2))
    s = board(client, h, a["id"])
    assert s["days_since_baseline"] == 2 and s["is_overdue"] is False


def test_hv_refusal_only_never_fed_gets_no_nudge(client, db_session, keeper, h, after_cutoff):
    a = hv_animal(client, h, "Picky")
    created_days_ago(db_session, a["id"], 2)
    feed(client, h, a["id"], 1, accepted=False)
    s = board(client, h, a["id"])
    assert s["needs_first_feeding"] is False and s["is_overdue"] is False


# ── plant-eaters ────────────────────────────────────────────────────────────

def test_herbivore_no_schedule_unless_keeper_interval(client, db_session, keeper, h, after_cutoff):
    from app.routers.animals import _animal_feeding_interval

    geyri = species(db_session, diet="herbivore", name=f"Uromastyx geyri {uuid.uuid4().hex[:6]}")
    a = hv_animal(client, h, "Sunny", taxon="lizard", interval=None, herp_species_id=str(geyri.id))
    feed(client, h, a["id"], 30)

    s = board(client, h, a["id"])
    assert s["interval_days"] is None
    assert s["no_schedule"] is True
    assert s["is_overdue"] is False
    assert s["needs_first_feeding"] is False
    assert detail(client, h, a["id"])["status"] not in ("due", "overdue")
    assert digest_count(db_session, keeper) == 0
    row = db_session.query(Animal).filter(Animal.id == uuid.UUID(a["id"])).one()
    assert _animal_feeding_interval(row) is None

    # The keeper's own number wins: interval 2 -> overdue on day 2.
    r = client.put(f"/api/v1/animals/{a['id']}", json={"feeding_interval_days": 2}, headers=h)
    assert r.status_code == 200, r.text
    b = hv_animal(client, h, "Sunny Two", taxon="lizard", interval=2, herp_species_id=str(geyri.id))
    feed(client, h, b["id"], 2)
    s = board(client, h, b["id"])
    assert s["interval_days"] == 2
    assert s["no_schedule"] is False
    assert s["is_overdue"] is True
    assert detail(client, h, b["id"])["status"] in ("due", "overdue")
    assert detail(client, h, b["id"])["status"] == "due"  # exactly the interval: due today
    assert digest_count(db_session, keeper) == 2  # Sunny (30 days, interval 2) + Sunny Two

    # Day 1 of a keeper interval of 2: not due anywhere.
    c = hv_animal(client, h, "Sunny Three", taxon="lizard", interval=2, herp_species_id=str(geyri.id))
    feed(client, h, c["id"], 1)
    s = board(client, h, c["id"])
    assert s["interval_days"] == 2
    assert s["is_overdue"] is False
    assert detail(client, h, c["id"])["status"] == "upcoming"
    assert digest_count(db_session, keeper) == 2


def test_herbivore_never_fed_gets_no_nudge(client, db_session, keeper, h, after_cutoff):
    geyri = species(db_session, diet="herbivore")
    a = hv_animal(client, h, "Leafy", taxon="lizard", interval=None, herp_species_id=str(geyri.id))
    created_days_ago(db_session, a["id"], 40)
    s = board(client, h, a["id"])
    assert s["no_schedule"] is True
    assert s["needs_first_feeding"] is False and s["is_overdue"] is False


def test_omnivore_keeps_its_species_schedule(client, db_session, keeper, h):
    beardie = species(db_session, diet="omnivore", freq="Daily")
    a = hv_animal(client, h, "Spike", taxon="lizard", interval=None, herp_species_id=str(beardie.id))
    feed(client, h, a["id"], 3)
    s = board(client, h, a["id"])
    assert s["interval_days"] == 1
    assert s["no_schedule"] is False
    assert s["is_overdue"] is True


def test_unlinked_animal_without_cadence_is_not_no_schedule(client, db_session, keeper, h):
    a = hv_animal(client, h, "Mystery", interval=None)
    feed(client, h, a["id"], 3)
    s = board(client, h, a["id"])
    assert s["interval_days"] is None
    assert s["no_schedule"] is False
    assert s["is_overdue"] is False


# ── brumation + keeper pause ────────────────────────────────────────────────

def test_brumation_and_pause_unchanged(client, db_session, keeper, h, after_cutoff):
    today = _now().date()
    resting = hv_animal(client, h, "Resting")
    paused = hv_animal(client, h, "Paused")
    lapsed = hv_animal(client, h, "Lapsed")
    for a in (resting, paused, lapsed):
        feed(client, h, a["id"], 30)
    set_cols(db_session, resting["id"], brumation_active=True)
    set_cols(db_session, paused["id"], feeding_paused_reason="hunger_strike",
             feeding_paused_until=today + timedelta(days=3))
    set_cols(db_session, lapsed["id"], feeding_paused_reason="hunger_strike",
             feeding_paused_until=today - timedelta(days=1))

    s = board(client, h, resting["id"])
    assert s["is_overdue"] is False and s["is_brumating"] is True
    assert detail(client, h, resting["id"])["status"] == "paused"

    s = board(client, h, paused["id"])
    assert s["is_overdue"] is False and s["is_feeding_paused"] is True
    d = detail(client, h, paused["id"])
    assert d["status"] == "paused" and d["note"].startswith("Hunger strike")

    s = board(client, h, lapsed["id"])
    assert s["is_overdue"] is True and s["is_feeding_paused"] is False
    assert detail(client, h, lapsed["id"])["status"] == "overdue"  # 30 days on a 7-day cadence

    assert digest_count(db_session, keeper) == 1


def test_brumating_never_fed_gets_no_nudge(client, db_session, keeper, h, after_cutoff):
    a = hv_animal(client, h, "Sleepy")
    created_days_ago(db_session, a["id"], 2)
    set_cols(db_session, a["id"], brumation_active=True)
    s = board(client, h, a["id"])
    assert s["needs_first_feeding"] is False and s["is_overdue"] is False


# ── one verdict everywhere ──────────────────────────────────────────────────

def test_board_and_detail_and_digest_agree(client, db_session, keeper, h, after_cutoff):
    # Exactly the interval since the last meal: the old window rule said
    # "due" (elapsed <= max) while the board said overdue.
    on_the_day = hv_animal(client, h, "On The Day", interval=7)
    feed(client, h, on_the_day["id"], 7)
    # Never fed, created after the cutoff, past its interval: the old detail
    # said "no_feedings" and the old digest skipped it.
    never = hv_animal(client, h, "Never", interval=5)
    created_days_ago(db_session, never["id"], 6)
    # Fed recently: nobody calls it overdue.
    fine = hv_animal(client, h, "Fine", interval=10)
    feed(client, h, fine["id"], 2)

    r = client.get(BOARD, headers=h)
    assert r.status_code == 200
    by_id = {i["id"]: i for i in r.json()}
    expected = {on_the_day["id"]: True, never["id"]: True, fine["id"]: False}
    for animal_id, overdue in expected.items():
        assert by_id[animal_id]["is_overdue"] is overdue, by_id[animal_id]
        # "due" and "overdue" on the detail screen are both "the board says
        # overdue"; anything else means it doesn't.
        assert (detail(client, h, animal_id)["status"] in {"due", "overdue"}) is overdue
    assert digest_count(db_session, keeper) == sum(expected.values())
    # On the interval day the detail says "due" (HV mobile: "Feed today"),
    # one day past it "overdue".
    assert detail(client, h, on_the_day["id"])["status"] == "due"
    assert detail(client, h, never["id"])["status"] == "overdue"
    assert detail(client, h, fine["id"])["status"] == "upcoming"


def test_detail_due_on_the_interval_day_then_overdue(client, db_session, keeper, h):
    a = hv_animal(client, h, "Weekly", interval=7)
    feed(client, h, a["id"], 7)
    d = detail(client, h, a["id"])
    assert board(client, h, a["id"])["is_overdue"] is True
    assert d["status"] == "due"
    assert d["days_until_due"] == 0

    b = hv_animal(client, h, "Weekly Late", interval=7)
    feed(client, h, b["id"], 8)
    d = detail(client, h, b["id"])
    assert d["status"] == "overdue"
    assert d["days_until_due"] == -1


def test_daily_feeder_due_today_not_overdue(client, db_session, keeper, h):
    """Interval 1: fed yesterday reads "Feed today", not "1 day overdue" in red."""
    a = hv_animal(client, h, "Hatchling", taxon="lizard", interval=1)
    feed(client, h, a["id"], 1)
    assert board(client, h, a["id"])["is_overdue"] is True
    d = detail(client, h, a["id"])
    assert d["status"] == "due"
    assert d["days_until_due"] == 0

    b = hv_animal(client, h, "Hatchling Late", taxon="lizard", interval=1)
    feed(client, h, b["id"], 2)
    assert detail(client, h, b["id"])["status"] == "overdue"

    c = hv_animal(client, h, "Hatchling Fed", taxon="lizard", interval=1)
    feed(client, h, c["id"], 0)
    assert board(client, h, c["id"])["is_overdue"] is False
    assert detail(client, h, c["id"])["status"] == "upcoming"


def test_keeper_schedule_text_window_follows_the_verdict(client, db_session, keeper, h):
    """The board's interval comes from the keeper's schedule text ("Every 5
    days") while the window resolver reads the species sheet (10-14 days).
    The window collapses to the verdict's interval so the two can't
    contradict each other."""
    sp = species(db_session, diet="carnivore", taxon="snake", freq="Every 10-14 days")
    a = hv_animal(client, h, "Scheduled", interval=None, herp_species_id=str(sp.id),
                  feeding_schedule="Every 5 days")
    feed(client, h, a["id"], 6)
    s = board(client, h, a["id"])
    assert s["interval_days"] == 5
    assert s["is_overdue"] is True
    d = detail(client, h, a["id"])
    assert d["interval_days_min"] == 5 and d["interval_days_max"] == 5
    assert d["status"] == "overdue"
    assert d["days_until_due"] == -1

    b = hv_animal(client, h, "Scheduled Fine", interval=None, herp_species_id=str(sp.id),
                  feeding_schedule="Every 5 days")
    feed(client, h, b["id"], 2)
    d = detail(client, h, b["id"])
    assert board(client, h, b["id"])["is_overdue"] is False
    assert d["interval_days_min"] == 5 and d["interval_days_max"] == 5
    assert d["status"] == "upcoming"
    assert d["days_until_due"] == 3


def test_window_kept_when_it_contains_the_verdict_interval(client, db_session, keeper, h):
    """No keeper number or schedule text: the species window (10-14) holds
    the verdict's interval, so the "eat again in 10-14 days" display stays."""
    sp = species(db_session, diet="carnivore", taxon="snake", freq="Every 10-14 days")
    a = hv_animal(client, h, "Ranged", interval=None, herp_species_id=str(sp.id))
    feed(client, h, a["id"], 3)
    s = board(client, h, a["id"])
    d = detail(client, h, a["id"])
    assert d["interval_days_min"] == 10 and d["interval_days_max"] == 14
    assert d["interval_days_min"] <= s["interval_days"] <= d["interval_days_max"]
    assert d["status"] == "upcoming"


def _local_one_am_offset():
    """A JS-style offset (positive west, within -12h..+12h) whose local time
    right now is about 01:00, so 2 hours ago was the previous local day."""
    now = _now()
    off = (now.hour * 60 + now.minute - 60) % 1440
    if off >= 720:
        off -= 1440
    return off


def test_detail_counts_days_in_the_sent_or_saved_zone(client, db_session, keeper, h):
    a = hv_animal(client, h, "Night Owl", taxon="lizard", interval=1)
    r = client.post(
        f"/api/v1/animals/{a['id']}/feedings",
        json={"fed_at": (_now() - timedelta(hours=2)).isoformat(), "accepted": True, "food_type": "cricket"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    off = _local_one_am_offset()
    url = f"/api/v1/animals/{a['id']}/feeding-status"

    # No zone sent, none saved: 24-hour count -> fed "today" -> not due.
    assert detail(client, h, a["id"])["status"] == "upcoming"

    # Zone sent: the meal was yesterday locally -> due today.
    r = client.get(url, params={"tz_offset_minutes": off}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "due"
    assert board(client, h, a["id"])["is_overdue"] is False  # board without a zone agrees with no zone
    rb = client.get(BOARD, params={"tz_offset_minutes": off}, headers=h)
    assert next(i for i in rb.json() if i["id"] == a["id"])["is_overdue"] is True

    # No zone sent, owner's saved zone (the digest's) is used.
    row = db_session.query(NotificationPreferences).filter(NotificationPreferences.user_id == keeper.id).first()
    if row is None:
        row = NotificationPreferences(user_id=keeper.id)
        db_session.add(row)
    row.tz_offset_minutes = off
    db_session.commit()
    assert detail(client, h, a["id"])["status"] == "due"

    # A zone sent wins over the saved one: local now ~03:00, meal ~01:00 today.
    later = off - 120 if off - 120 >= -720 else off - 120 + 1440
    r = client.get(url, params={"tz_offset_minutes": later}, headers=h)
    assert r.json()["status"] == "upcoming"


def test_detail_keeps_its_window_fields(client, db_session, keeper, h):
    a = hv_animal(client, h, "Windowed", interval=10)
    feed(client, h, a["id"], 3)
    d = detail(client, h, a["id"])
    assert d["status"] == "upcoming"
    assert d["interval_days_min"] == 10 and d["interval_days_max"] == 10
    assert d["days_until_due"] == 7
    assert d["next_feeding_due_at"] is not None and d["next_feeding_overdue_at"] is not None


# ── refusal restarts the wait (owner switch) ────────────────────────────────

@pytest.mark.parametrize("switch_on", [False, True])
def test_hv_refusal_restart_switch(client, db_session, keeper, h, switch_on):
    set_rules(db_session, keeper, refusal=switch_on)
    a = hv_animal(client, h, "Refuser", interval=7)
    feed(client, h, a["id"], 10)
    feed(client, h, a["id"], 2, accepted=False)

    s = board(client, h, a["id"])
    assert s["days_since_last_feeding"] == 10
    assert s["is_overdue"] is (not switch_on)
    assert (s["last_offered_date"] is not None) is switch_on
    d = detail(client, h, a["id"])
    assert (d["status"] in {"due", "overdue"}) is (not switch_on)
    if switch_on:
        # The wait restarted at the refusal 2 days ago: due in 5, not "today".
        assert d["status"] == "upcoming"
        assert d["days_until_due"] == 5
    assert digest_count(db_session, keeper) == (0 if switch_on else 1)


def _feed_at_noon(client, headers, animal_id, days_ago, accepted=True):
    when = datetime.combine(_now().date() - timedelta(days=days_ago), time(12, 0), tzinfo=timezone.utc)
    body = {"fed_at": when.isoformat(), "accepted": accepted}
    if accepted:
        body["food_type"] = "mouse"
    r = client.post(f"/api/v1/animals/{animal_id}/feedings", json=body, headers=headers)
    assert r.status_code == 201, r.text


def test_never_fed_overdue_counts_from_the_refusal(client, db_session, keeper, h, after_cutoff):
    """Never fed, refusal switch on: the wait restarts at the refusal, so
    days_until_due counts from it, not from the day the animal was added."""
    set_rules(db_session, keeper, refusal=True)
    a = hv_animal(client, h, "Stubborn", interval=7)
    created_days_ago(db_session, a["id"], 20)
    _feed_at_noon(client, h, a["id"], 9, accepted=False)

    s = board(client, h, a["id"])
    assert s["is_overdue"] is True
    assert s["days_since_baseline"] == 20
    d = detail(client, h, a["id"])
    assert d["status"] == "overdue"
    assert d["days_until_due"] == 7 - 9  # not 7 - 20

    b = hv_animal(client, h, "Stubborn Today", interval=7)
    created_days_ago(db_session, b["id"], 20)
    _feed_at_noon(client, h, b["id"], 7, accepted=False)
    d = detail(client, h, b["id"])
    assert board(client, h, b["id"])["is_overdue"] is True
    assert d["status"] == "due"
    assert d["days_until_due"] == 0


def test_hv_cutoff_is_its_own_constant():
    from app.services import feeding_status

    assert animal_feeding_status.HV_FIRST_FEEDING_DUE_FROM == date(2026, 11, 18)
    assert feeding_status.FIRST_FEEDING_DUE_FROM == date(2026, 10, 28)

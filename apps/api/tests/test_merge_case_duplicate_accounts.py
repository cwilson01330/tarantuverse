"""merge_case_duplicate_accounts.py folds accounts that differ only by email case.

Keeper choice (rows, then animals, then age); a Google-only keeper gains the
spare's password; two passwords keep the keeper's and warn; one-per-user and
unique-keyed tables move what they can and drop only exact duplicates and
self-references; anything the script doesn't know aborts that pair untouched;
dry run writes nothing; a re-run finds nothing; the backup holds the originals
and its undo SQL really restores them; three accounts are skipped; an error
rolls everything back.
"""
import contextlib
import json
import os
import stat
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

import app.models  # noqa: F401  (registers every table)
from app.models.achievement import AchievementDefinition, UserAchievement
from app.models.follow import Follow
from app.models.invert import Invert
from app.models.notification_preferences import NotificationPreferences
from app.models.sitter_pass import SitterGuide
from app.models.user import User
from app.models.user_block import UserBlock
from app.models.user_oauth_account import UserOAuthAccount
from app.models.user_theme_preferences import UserThemePreferences

import merge_case_duplicate_accounts as mg

pg = pytest.mark.requires_postgres

HASH_A = "$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
HASH_B = "$2b$12$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
T0 = datetime(2025, 1, 1, tzinfo=timezone.utc)


# ── pure checks ──────────────────────────────────────────────────────────────

def _acct(id, rows, animals=0, days=0):
    return {"id": id, "rows": rows, "animals": animals, "created_at": T0 + timedelta(days=days)}


def test_keeper_is_the_account_with_more_rows():
    k, s, why = mg.choose_keeper(_acct("a", 2), _acct("b", 9))
    assert (k["id"], s["id"]) == ("b", "a") and "more rows" in why


def test_tie_goes_to_the_account_with_animals_then_the_older_then_lower_id():
    k, _s, why = mg.choose_keeper(_acct("a", 3, animals=0), _acct("b", 3, animals=2))
    assert k["id"] == "b" and "owns animals" in why
    k, _s, why = mg.choose_keeper(_acct("a", 0, days=5), _acct("b", 0, days=1))
    assert k["id"] == "b" and "older" in why
    # Both own animals: the animal count itself doesn't matter, age does.
    k, _s, why = mg.choose_keeper(_acct("a", 1, animals=1, days=3), _acct("b", 1, animals=9, days=2))
    assert k["id"] == "b" and "older" in why
    k, _s, why = mg.choose_keeper(_acct("b", 1, animals=1), _acct("a", 1, animals=1))
    assert k["id"] == "a" and "lower id" in why


def test_emails_are_masked():
    assert mg.mask_email("Kelly.Smith@Gmail.com") == "K***@Gmail.com"
    assert mg.mask_email("nonsense") == "***"


def test_apply_needs_a_backup_and_never_overwrites_one(tmp_path):
    with pytest.raises(SystemExit, match="--backup"):
        mg.main(["--apply"])
    existing = tmp_path / "b.json"
    existing.write_text("{}")
    with pytest.raises(SystemExit, match="already exists"):
        mg.main(["--apply", "--backup", str(existing)])
    with pytest.raises(FileExistsError):
        mg.write_backup(str(existing), [])
    assert existing.read_text() == "{}"


# ── building scenes ──────────────────────────────────────────────────────────

class Scene:
    def __init__(self, db):
        self.db = db
        self.conn = db.connection()

    def user(self, email, *, pw=None, days=0, verified=True, active=True, **kw):
        u = User(id=uuid.uuid4(), email=email, username=f"u_{uuid.uuid4().hex[:12]}", hashed_password=pw,
                 is_active=active, is_verified=verified, created_at=T0 + timedelta(days=days), **kw)
        self.db.add(u)
        self.db.flush()
        return u

    def pair(self, **kw):
        """(keeper, spare) with emails equal apart from case; the keeper gets `n` animals."""
        base = f"Case.{uuid.uuid4().hex[:10]}@Example.COM"
        keeper_kw = kw.pop("keeper", {})
        spare_kw = kw.pop("spare", {})
        keeper = self.user(base, **keeper_kw)
        spare = self.user(base.lower(), **{"days": 1, **spare_kw})
        return keeper, spare

    def animals(self, user, n=1):
        for _ in range(n):
            self.db.add(Invert(user_id=user.id, taxon="tarantula"))
        self.db.flush()

    def add(self, *objs):
        self.db.add_all(objs)
        self.db.flush()

    def row(self, user):
        return json.loads(self.conn.execute(text("select to_jsonb(u)::text from users u where id = :i"),
                                            {"i": str(user.id)}).scalar())

    def snapshot(self):
        return {r[0]: json.loads(r[1]) for r in self.conn.execute(text("select id::text, to_jsonb(u)::text from users u"))}

    def scalar(self, sql, **p):
        return self.conn.execute(text(sql), p).scalar()

    def plan_for(self, result, user):
        key = user.email.lower()
        return next(p for p in result.plans if p.key == key)

    def run(self, apply=False, backup=None, **kw):
        lines: list[str] = []
        result = mg.merge_accounts(self.conn, apply, backup, out=lines.append, **kw)
        return result, "\n".join(lines)


@pytest.fixture
def scene(db_session):
    return Scene(db_session)


# ── schema discovery ─────────────────────────────────────────────────────────

@pg
def test_foreign_keys_are_discovered_at_run_time(scene):
    fks = mg.fk_columns(scene.conn)
    assert len(fks) > 50 and ("inverts", "user_id") in fks and ("user_oauth_accounts", "user_id") in fks


@pg
def test_every_column_the_script_names_is_a_real_reference_to_users(scene):
    fks = set(mg.fk_columns(scene.conn))
    named = set(mg.SIMPLE_COLUMNS) | set(mg.CONFLICT_RULES) | {mg.OAUTH, mg.REFERRED_BY}
    assert named <= fks, sorted(named - fks)


@pg
def test_no_plain_move_column_is_blocked_by_a_unique_index(scene):
    """Otherwise a normal move would be refused at run time."""
    for table, col in mg.SIMPLE_COLUMNS:
        assert mg.pk_columns(scene.conn, table), table
        assert not mg.unique_indexes_on(scene.conn, table, col), (table, col)


# ── the two production shapes ────────────────────────────────────────────────

@pg
def test_google_only_keeper_gains_the_spares_password(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": None, "verified": False}, spare={"pw": HASH_A, "verified": True})
    scene.animals(keeper, 3)
    scene.add(UserOAuthAccount(user_id=keeper.id, provider="google", provider_account_id=f"g-{uuid.uuid4().hex}"))
    google_id = scene.scalar("select id::text from user_oauth_accounts where user_id = :u", u=str(keeper.id))

    result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    plan = scene.plan_for(result, keeper)
    assert plan.status == "ok" and plan.keeper["id"] == str(keeper.id)

    k, s = scene.row(keeper), scene.row(spare)
    assert k["hashed_password"] == HASH_A and k["is_verified"] is True
    assert scene.scalar("select user_id::text from user_oauth_accounts where id = :i", i=google_id) == str(keeper.id)
    assert scene.scalar("select count(*) from inverts where user_id = :u", u=str(keeper.id)) == 3
    assert s["email"] == f"merged-{spare.id}@merged.invalid" and s["is_active"] is False
    assert s["hashed_password"] is None and s["reset_token"] is None
    assert "password hash carried" in out
    # The report never shows a whole address or a hash.
    assert keeper.email not in out and spare.email not in out and HASH_A not in out
    assert "C***@Example.COM" in out


@pg
def test_two_passwords_keep_the_keepers_and_warn(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 2)
    result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok"
    assert scene.row(keeper)["hashed_password"] == HASH_A
    assert scene.row(spare)["hashed_password"] is None
    assert any("NOT carried" in w for w in scene.plan_for(result, keeper).warnings)
    assert "NOT carried" in out and HASH_B not in out


# ── moving the spare's rows ──────────────────────────────────────────────────

@pg
def test_spare_animals_move_to_the_keeper(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 4)
    scene.animals(spare, 2)
    result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok"
    assert scene.scalar("select count(*) from inverts where user_id = :u", u=str(keeper.id)) == 6
    assert scene.scalar("select count(*) from inverts where user_id = :u", u=str(spare.id)) == 0
    assert "inverts.user_id" in out


@pg
def test_one_per_user_tables_keep_the_keepers_and_move_the_spares_otherwise(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 5)
    scene.add(NotificationPreferences(user_id=keeper.id, digest_hour=7),
              NotificationPreferences(user_id=spare.id, digest_hour=21),
              UserThemePreferences(user_id=spare.id))
    backup = tmp_path / "b.json"
    result, _out = scene.run(apply=True, backup=str(backup))
    assert scene.plan_for(result, keeper).status == "ok"
    assert scene.scalar("select digest_hour from notification_preferences where user_id = :u", u=str(keeper.id)) == 7
    assert scene.scalar("select count(*) from notification_preferences where user_id = :u", u=str(spare.id)) == 0
    assert scene.scalar("select count(*) from user_theme_preferences where user_id = :u", u=str(keeper.id)) == 1
    dropped = json.loads(backup.read_text())["groups"][0]["dropped"]
    assert [d["table"] for d in dropped] == ["notification_preferences"]
    assert dropped[0]["row"]["digest_hour"] == 21  # the dropped row's contents are kept


@pg
def test_follows_blocks_and_achievements_move_without_collisions(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    x = scene.user(f"x-{uuid.uuid4().hex[:8]}@example.com")
    y = scene.user(f"y-{uuid.uuid4().hex[:8]}@example.com")
    scene.animals(keeper, 30)
    a1 = AchievementDefinition(key=f"k{uuid.uuid4().hex[:8]}", name="a", description="d", icon="x",
                               category="c", tier="bronze", requirement_count=1)
    a2 = AchievementDefinition(key=f"k{uuid.uuid4().hex[:8]}", name="b", description="d", icon="x",
                               category="c", tier="bronze", requirement_count=1)
    scene.add(a1, a2)
    scene.add(
        Follow(follower_id=spare.id, followed_id=x.id),       # moves
        Follow(follower_id=spare.id, followed_id=y.id),       # keeper already follows y: dropped
        Follow(follower_id=keeper.id, followed_id=y.id),
        Follow(follower_id=spare.id, followed_id=keeper.id),  # would follow itself: dropped
        Follow(follower_id=keeper.id, followed_id=spare.id),  # would follow itself: dropped
        Follow(follower_id=spare.id, followed_id=spare.id),   # dropped (once)
        Follow(follower_id=x.id, followed_id=spare.id),       # moves
        UserBlock(blocker_id=spare.id, blocked_id=x.id),      # moves
        UserBlock(blocker_id=spare.id, blocked_id=y.id),      # duplicate: dropped
        UserBlock(blocker_id=keeper.id, blocked_id=y.id),
        UserAchievement(user_id=keeper.id, achievement_id=a1.id),
        UserAchievement(user_id=spare.id, achievement_id=a1.id),  # duplicate: dropped
        UserAchievement(user_id=spare.id, achievement_id=a2.id),  # moves
    )
    before = scene.snapshot()
    follows_before = set(scene.conn.execute(text("select follower_id::text, followed_id::text from follows")).all())
    backup = tmp_path / "b.json"
    result, out = scene.run(apply=True, backup=str(backup))
    assert scene.plan_for(result, keeper).status == "ok", out

    K, X, Y = str(keeper.id), str(x.id), str(y.id)
    assert set(scene.conn.execute(text("select follower_id::text, followed_id::text from follows")).all()) == {
        (K, Y), (K, X), (X, K)}
    assert set(scene.conn.execute(text("select blocker_id::text, blocked_id::text from user_blocks")).all()) == {
        (K, Y), (K, X)}
    assert set(scene.conn.execute(text("select achievement_id::text from user_achievements where user_id = :u"),
                                  {"u": K}).scalars()) == {str(a1.id), str(a2.id)}
    assert len(scene.plan_for(result, keeper).drops) == 4 + 1 + 1

    # The backup's undo SQL puts everything back, exactly.
    group = json.loads(backup.read_text())["groups"][0]
    for stmt in group["undo_sql"]:
        scene.conn.exec_driver_sql(stmt)
    assert scene.snapshot() == before
    assert set(scene.conn.execute(text("select follower_id::text, followed_id::text from follows")).all()) == follows_before
    assert scene.scalar("select count(*) from user_achievements where user_id = :u", u=str(spare.id)) == 2


@pg
def test_referrals_follow_the_keeper(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 5)
    referred = scene.user(f"r-{uuid.uuid4().hex[:8]}@example.com", referred_by_user_id=spare.id)
    scene.conn.execute(text("update users set referred_by_user_id = :s where id = :k"),
                       {"s": str(spare.id), "k": str(keeper.id)})
    result, _out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok"
    assert scene.row(referred)["referred_by_user_id"] == str(keeper.id)
    assert scene.row(keeper)["referred_by_user_id"] is None  # not its own referrer


# ── sign-in links ────────────────────────────────────────────────────────────

@pg
def test_a_provider_link_both_accounts_have_aborts_the_pair(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 3)
    scene.add(UserOAuthAccount(user_id=keeper.id, provider="google", provider_account_id=f"g-{uuid.uuid4().hex}"),
              UserOAuthAccount(user_id=spare.id, provider="google", provider_account_id=f"g-{uuid.uuid4().hex}"))
    before = scene.snapshot()
    backup = tmp_path / "b.json"
    result, out = scene.run(apply=True, backup=str(backup))
    assert scene.plan_for(result, keeper).status == "aborted" and result.exit_code == 2
    assert "ABORTED" in out and scene.snapshot() == before and not backup.exists()
    assert scene.scalar("select count(*) from user_oauth_accounts where user_id = :u", u=str(spare.id)) == 1


@pg
def test_a_link_the_keeper_lacks_moves_and_legacy_columns_are_carried(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": None, "oauth_provider": "apple", "oauth_id": "apple-1"})
    scene.animals(keeper, 3)
    scene.add(UserOAuthAccount(user_id=keeper.id, provider="google", provider_account_id=f"g-{uuid.uuid4().hex}"),
              UserOAuthAccount(user_id=spare.id, provider="apple", provider_account_id="apple-1"))
    result, _out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok"
    assert scene.scalar("select count(*) from user_oauth_accounts where user_id = :u", u=str(keeper.id)) == 2
    # The spare's legacy apple columns travel with its apple row, so nothing is copied over.
    assert scene.row(keeper)["oauth_provider"] is None
    assert scene.row(spare)["oauth_provider"] is None and scene.row(spare)["oauth_id"] is None


@pg
def test_legacy_sign_in_columns_copy_to_a_keeper_without_them(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": None, "oauth_provider": "google", "oauth_id": "legacy-1"})
    scene.animals(keeper, 3)
    result, _out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok"
    assert (scene.row(keeper)["oauth_provider"], scene.row(keeper)["oauth_id"]) == ("google", "legacy-1")
    assert scene.row(spare)["oauth_provider"] is None


@pg
def test_conflicting_legacy_identities_abort(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A, "oauth_provider": "google", "oauth_id": "one"},
                               spare={"pw": None, "oauth_provider": "google", "oauth_id": "two"})
    scene.animals(keeper, 3)
    result, _out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "aborted"
    assert scene.row(spare)["oauth_id"] == "two"


# ── refusing to guess ────────────────────────────────────────────────────────

@pg
def test_rows_in_an_unknown_table_abort_that_pair_only(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 3)
    scene.add(SitterGuide(owner_user_id=spare.id, app="tarantuverse"))
    good_keeper, good_spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(good_keeper, 3)
    before = {k: v for k, v in scene.snapshot().items() if k in {str(keeper.id), str(spare.id)}}

    backup = tmp_path / "b.json"
    result, out = scene.run(apply=True, backup=str(backup))
    bad = scene.plan_for(result, keeper)
    assert bad.status == "aborted" and "sitter_guides.owner_user_id" in out
    assert {k: v for k, v in scene.snapshot().items() if k in before} == before
    assert scene.scalar("select count(*) from sitter_guides where owner_user_id = :u", u=str(spare.id)) == 1
    # The other pair was still merged, and only it is in the backup.
    assert scene.plan_for(result, good_keeper).status == "ok"
    assert scene.row(good_spare)["is_active"] is False
    groups = json.loads(backup.read_text())["groups"]
    assert [g["keeper_id"] for g in groups] == [str(good_keeper.id)]
    assert result.exit_code == 2


@pg
def test_three_accounts_are_skipped(scene, tmp_path):
    base = f"Tri.{uuid.uuid4().hex[:8]}@Example.com"
    for e in (base, base.lower(), base.upper()):
        scene.user(e)
    before = scene.snapshot()
    backup = tmp_path / "b.json"
    result, out = scene.run(apply=True, backup=str(backup))
    plan = next(p for p in result.plans if p.key == base.lower())
    assert plan.status == "skipped" and "SKIPPED" in out
    assert scene.snapshot() == before and not backup.exists() and result.exit_code == 2


# ── dry run, re-run, rollback, backup ────────────────────────────────────────

@pg
def test_dry_run_writes_nothing(scene, monkeypatch):
    keeper, spare = scene.pair(keeper={"pw": None}, spare={"pw": HASH_A})
    scene.animals(keeper, 2)
    scene.animals(spare, 1)
    before = scene.snapshot()
    inverts_before = scene.scalar("select count(*) from inverts where user_id = :u", u=str(spare.id))

    def boom(*a, **k):
        raise AssertionError("a dry run must not write")
    monkeypatch.setattr(mg, "execute_plan", boom)
    monkeypatch.setattr(mg, "write_backup", boom)
    result, out = scene.run(apply=False)

    assert scene.plan_for(result, keeper).status == "ok"
    assert "would" in out and "was retired" not in out
    assert scene.snapshot() == before
    assert scene.scalar("select count(*) from inverts where user_id = :u", u=str(spare.id)) == inverts_before


@pg
def test_second_run_finds_nothing(scene, tmp_path):
    keeper, _spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 2)
    scene.run(apply=True, backup=str(tmp_path / "b.json"))
    result, out = scene.run(apply=True, backup=str(tmp_path / "b2.json"))
    assert result.plans == [] and "Nothing to do" in out
    assert not (tmp_path / "b2.json").exists()


@pg
def test_backup_has_both_original_rows_hashes_and_moved_ids(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 4)
    scene.animals(spare, 2)
    moved_ids = sorted(scene.conn.execute(text("select id::text from inverts where user_id = :u"),
                                          {"u": str(spare.id)}).scalars())
    before = scene.snapshot()
    backup = tmp_path / "b.json"
    scene.run(apply=True, backup=str(backup))

    data = json.loads(backup.read_text())
    (g,) = data["groups"]
    assert g["keeper_before"] == before[str(keeper.id)] and g["spare_before"] == before[str(spare.id)]
    assert g["keeper_before"]["hashed_password"] == HASH_A and g["spare_before"]["hashed_password"] == HASH_B
    (move,) = [m for m in g["moved"] if m["table"] == "inverts"]
    assert sorted(i[0] for i in move["ids"]) == moved_ids
    assert "password hashes" in data["WARNING"]
    if os.name == "posix":
        assert stat.S_IMODE(backup.stat().st_mode) & 0o077 == 0  # owner-only: it holds password hashes

    # Undo restores both accounts and the moved animals.
    for stmt in g["undo_sql"]:
        scene.conn.exec_driver_sql(stmt)
    assert scene.snapshot() == before
    assert sorted(scene.conn.execute(text("select id::text from inverts where user_id = :u"),
                                     {"u": str(spare.id)}).scalars()) == moved_ids


# ── polish round: --skip-password-copy ──────────────────────────────────────

@pg
def test_skip_password_copy_never_copies_a_hash(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": None, "verified": False}, spare={"pw": HASH_A})
    scene.animals(keeper, 3)
    result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"), skip_password_copy=True)
    assert scene.plan_for(result, keeper).status == "ok"
    assert scene.row(keeper)["hashed_password"] is None
    assert scene.row(spare)["hashed_password"] is None and scene.row(spare)["is_active"] is False
    assert "password hash carried" not in out
    assert "--skip-password-copy" in out and "NOT copied" in out
    assert HASH_A not in out
    assert scene.scalar("select count(*) from inverts where user_id = :u", u=str(keeper.id)) == 3


@pg
def test_skip_password_copy_says_so_for_every_group(scene, tmp_path):
    k1, _s1 = scene.pair(keeper={"pw": None}, spare={"pw": HASH_A})
    k2, _s2 = scene.pair(keeper={"pw": HASH_A}, spare={"pw": None})
    scene.animals(k1, 2)
    scene.animals(k2, 2)
    result, out = scene.run(apply=False, skip_password_copy=True)
    assert out.count("--skip-password-copy: no password hash is copied in this group") == 2
    assert all(p.status == "ok" for p in result.plans)
    # No statement of the plan sets a password on the keeper.
    for p in result.plans:
        assert not any("hashed_password = :v_" in st.sql for st in p.statements)


@pg
def test_default_still_copies_the_hash(scene, tmp_path):
    keeper, _spare = scene.pair(keeper={"pw": None}, spare={"pw": HASH_A})
    scene.animals(keeper, 2)
    _result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.row(keeper)["hashed_password"] == HASH_A and "--skip-password-copy" not in out


def test_cli_flag_is_wired_through_main(monkeypatch, capsys):
    import app.database as database

    seen = {}

    class _Conn:
        def execute(self, *a, **k):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class _Engine:
        def connect(self):
            return _Conn()

        begin = connect

    def fake_merge(conn, apply, backup_path=None, out=print, skip_password_copy=False):
        seen["skip"] = skip_password_copy
        return mg.MergeResult(apply=apply)

    monkeypatch.setattr(database, "engine", _Engine())
    monkeypatch.setattr(mg, "merge_accounts", fake_merge)
    assert mg.main(["--skip-password-copy"]) == 0
    assert seen["skip"] is True
    assert "--skip-password-copy" in capsys.readouterr().out
    assert mg.main([]) == 0 and seen["skip"] is False


# ── polish round: errors never print account data ────────────────────────────

def _db_error():
    from sqlalchemy.exc import IntegrityError

    class _Orig(Exception):
        pgcode = "23505"

    return IntegrityError(
        "update users set hashed_password = %(v_hashed_password)s where id = %(k)s",
        {"v_hashed_password": HASH_A, "k": "secret-id", "email": "secret.person@example.com"},
        _Orig('duplicate key value violates unique constraint "ix_users_email" '
              'DETAIL: Key (email)=(secret.person@example.com) already exists.'),
    )


def test_safe_error_text_hides_database_error_details():
    msg = mg.safe_error_text(_db_error())
    assert "IntegrityError" in msg and "_Orig" in msg and "23505" in msg
    for secret in (HASH_A, "secret.person@example.com", "secret-id", "v_hashed_password", "parameters"):
        assert secret not in msg
    assert "ix_users_email" not in msg


def test_safe_error_text_prints_our_own_messages_and_only_the_type_of_others():
    assert mg.safe_error_text(mg.MergeError("A***@x.com: expected to change 1 row(s)")) == "A***@x.com: expected to change 1 row(s)"
    other = mg.safe_error_text(ValueError(f"oops {HASH_A}"))
    assert "ValueError" in other and HASH_A not in other


@pytest.mark.parametrize("apply", [False, True])
def test_main_failure_output_has_no_hash_or_email(monkeypatch, capsys, tmp_path, apply):
    import app.database as database

    class _Conn:
        def execute(self, *a, **k):
            return None

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class _Engine:
        def connect(self):
            return _Conn()

        begin = connect

    def failing(*a, **k):
        raise _db_error()

    monkeypatch.setattr(database, "engine", _Engine())
    monkeypatch.setattr(mg, "merge_accounts", failing)
    argv = ["--apply", "--backup", str(tmp_path / "b.json")] if apply else []
    assert mg.main(argv) == 1
    captured = capsys.readouterr()
    text_out = captured.out + captured.err
    assert "ERROR: IntegrityError" in text_out and "rolled back" in text_out
    for secret in (HASH_A, "secret.person@example.com", "secret-id", "v_hashed_password"):
        assert secret not in text_out


@pg
def test_a_real_database_error_during_apply_prints_no_hash(scene, tmp_path, monkeypatch, capsys):
    """A forced IntegrityError from Postgres itself while the keeper row is updated."""
    import app.database as database
    from sqlalchemy.exc import IntegrityError

    keeper, spare = scene.pair(keeper={"pw": None}, spare={"pw": HASH_A})
    scene.animals(keeper, 2)
    real = mg.execute_plan

    def clash(conn, plan):
        real(conn, plan)
        # A write that carries the hash and email as bound parameters and violates a unique index,
        # so the driver's error text and SQLAlchemy's [parameters: ...] both hold them.
        conn.execute(text("update users set email = :e, hashed_password = :h where id = :i"),
                     {"e": spare.email, "h": HASH_A, "i": str(keeper.id)})
        conn.execute(text("insert into users (id, email, username, hashed_password) values (:i, :e, :u, :h)"),
                     {"i": str(uuid.uuid4()), "e": spare.email, "u": f"dup_{uuid.uuid4().hex[:8]}", "h": HASH_A})

    class _Engine:
        @contextlib.contextmanager
        def begin(self):
            with scene.conn.begin_nested():
                yield scene.conn

    monkeypatch.setattr(database, "engine", _Engine())
    monkeypatch.setattr(mg, "execute_plan", clash)
    assert mg.main(["--apply", "--backup", str(tmp_path / "b.json")]) == 1
    captured = capsys.readouterr()
    out = captured.out + captured.err
    assert "ERROR:" in out and HASH_A not in out and spare.email not in out and spare.email.lower() not in out


# ── polish round: aborted groups are described as aborted ───────────────────

@pg
def test_aborted_group_says_what_was_found_and_that_nothing_changed(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": None}, spare={"pw": HASH_B})
    scene.animals(keeper, 3)
    scene.add(SitterGuide(owner_user_id=spare.id, app="tarantuverse"))
    for apply in (False, True):
        result, out = scene.run(apply=apply, backup=str(tmp_path / f"b{apply}.json"))
        assert scene.plan_for(result, keeper).status == "aborted"
        low = out.lower()
        for word in ("moved", "would move", "carried", "owns nothing", "was retired", "would be retired", "dropped"):
            assert word not in low, (apply, word, out)
        assert "found on the spare (nothing was changed)" in out
        assert "sitter_guides.owner_user_id" in out
        assert "left exactly as it was" in out
    assert scene.row(spare)["hashed_password"] == HASH_B and scene.row(spare)["is_active"] is True


# ── polish round: foreign keys come from pg_catalog; the cross-check only warns ──

@pg
def test_information_schema_disagreement_is_a_warning_not_a_stop(scene, tmp_path, monkeypatch):
    keeper, _spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 2)
    monkeypatch.setattr(mg, "_FK_INFO_SQL", "select 'inverts', 'user_id' union all select 'ghost', 'user_id'")
    result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok"
    assert "WARNING: information_schema and pg_catalog disagree" in out and "warning only" in out
    assert scene.row(_spare)["is_active"] is False


@pg
def test_a_failing_cross_check_does_not_poison_the_run(scene, tmp_path, monkeypatch):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 2)
    monkeypatch.setattr(mg, "_FK_INFO_SQL", "select * from no_such_table_anywhere")
    result, out = scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert scene.plan_for(result, keeper).status == "ok" and "could not cross-check" in out
    assert scene.row(spare)["is_active"] is False


@pg
def test_a_matching_cross_check_is_silent(scene):
    keeper, _spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 2)
    _result, out = scene.run(apply=False)
    assert "WARNING: information_schema" not in out and "could not cross-check" not in out


@pg
def test_a_table_in_another_schema_is_found_and_aborts_a_spare_that_has_rows_there(scene, tmp_path):
    cur = scene.scalar("select current_schema()")
    scene.conn.exec_driver_sql("create schema zz_merge_other")
    scene.conn.exec_driver_sql(
        f'create table zz_merge_other.notes (id serial primary key, user_id uuid references "{cur}".users(id))')
    assert ("zz_merge_other.notes", "user_id") in mg.fk_columns(scene.conn)

    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(keeper, 3)
    scene.conn.execute(text("insert into zz_merge_other.notes (user_id) values (:u)"), {"u": str(spare.id)})
    before = scene.snapshot()
    backup = tmp_path / "b.json"
    result, out = scene.run(apply=True, backup=str(backup))
    assert scene.plan_for(result, keeper).status == "aborted"
    assert "zz_merge_other.notes.user_id" in out and scene.snapshot() == before and not backup.exists()


# ── polish round: small lows ────────────────────────────────────────────────

@pg
def test_retired_spare_is_made_private_and_undo_restores_it(scene, tmp_path):
    keeper, spare = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B, "collection_visibility": "public"})
    scene.animals(keeper, 2)
    before = scene.snapshot()
    backup = tmp_path / "b.json"
    scene.run(apply=True, backup=str(backup))
    assert scene.row(spare)["collection_visibility"] == "private"
    data = json.loads(backup.read_text())
    assert "only clean soon after the merge" in data["how_to_undo"]
    for stmt in data["groups"][0]["undo_sql"]:
        scene.conn.exec_driver_sql(stmt)
    assert scene.snapshot() == before and scene.row(spare)["collection_visibility"] == "public"


@pg
def test_emails_that_differ_by_spaces_are_not_grouped(scene):
    base = f"Space.{uuid.uuid4().hex[:8]}@Example.com"
    scene.user(base)
    scene.user(f" {base.lower()}")
    result, out = scene.run(apply=False)
    assert all(p.key != base.lower() for p in result.plans)


@pg
def test_an_error_midway_rolls_every_group_back(scene, tmp_path, monkeypatch):
    k1, _s1 = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    k2, _s2 = scene.pair(keeper={"pw": HASH_A}, spare={"pw": HASH_B})
    scene.animals(k1, 2)
    scene.animals(k2, 2)
    before = scene.snapshot()
    real = mg.execute_plan
    calls = []

    def flaky(conn, plan):
        real(conn, plan)
        calls.append(plan.key)
        if len(calls) == 2:
            raise RuntimeError("disk on fire")
    monkeypatch.setattr(mg, "execute_plan", flaky)
    with pytest.raises(RuntimeError, match="disk on fire"):
        scene.run(apply=True, backup=str(tmp_path / "b.json"))
    assert len(calls) == 2
    assert scene.snapshot() == before

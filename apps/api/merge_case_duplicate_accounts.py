"""Merge accounts whose emails differ only by letter case.

WHY
---
Sign-up and sign-in used to compare emails case-sensitively, so a keeper who
once typed "Name@Gmail.com" and later "name@gmail.com" ended up with TWO
accounts: one holding their collection, one that is empty. Depending on how
they sign in (password vs Google/Apple, or which spelling they type) they land
in a different account. After the API compares emails case-insensitively these
pairs must be folded into one account, so the keeper reaches their whole
collection whichever way they sign in.

WHAT IT DOES (per group of accounts sharing lower(email), exactly as the API looks emails up)
----------------------------------------------------------------------------------------------
* Only PAIRS are merged. A group of three or more is reported and skipped.
* KEEPER = the account with the most rows in all the tables that reference
  users.id (found at run time from pg_catalog, all schemas, never a fixed list);
  tie -> the one that owns animals (inverts); tie -> the older account.
  The other account is the SPARE.
* The spare's rows are moved to the keeper, but ONLY in tables this script
  handles explicitly:
    - plain ownership / "logged by" columns (SIMPLE_COLUMNS) -> UPDATE, and
      only when no unique index covers the column;
    - one-row-per-user tables and tables with a unique key that includes the
      user (CONFLICT_RULES: notification_preferences, user_theme_preferences,
      user_achievements, species_shortlist, follows, user_blocks): move what
      does not collide; a row that duplicates one the keeper already has, or
      would point an account at itself, is DROPPED (its full contents go in
      the backup file);
    - user_oauth_accounts: a provider link moves only if the keeper has no
      link for that provider - otherwise the group is ABORTED;
    - users.referred_by_user_id (other keepers referred by the spare).
  If the spare has rows in ANY other table the group is ABORTED and the tables
  are listed. Nothing is ever dropped silently.
* Credentials, so both ways of signing in reach the keeper: if the keeper has
  no password and the spare has one, the spare's hash is copied to the keeper.
  If both have passwords the keeper's is kept (the spare's is NOT carried; the
  keeper can use "Forgot password"). The legacy users.oauth_provider/oauth_id
  columns are carried the same way. is_verified is true if either was.
  With --skip-password-copy NO password hash is ever copied (the report says so
  for every group); a password-less keeper then signs in with Google/Apple only
  ("Forgot password" on a social-only account sends "how you sign in", not a
  reset link).
* The spare is RETIRED, not deleted: email -> merged-<id>@merged.invalid,
  is_active -> false, collection_visibility -> private (so it drops out of
  public listings), password / reset / verification tokens / legacy OAuth
  columns cleared (so nothing can sign in to or reset the spare any more).
  A device still signed in to the spare gets 401 and signs out.
* Keeper emails are not touched. The API now compares case-insensitively.

REVERSIBLE
----------
--apply needs --backup FILE (must not exist). Before the first write it holds a
JSON file with BOTH original users rows (every column, INCLUDING PASSWORD
HASHES AND OAUTH TOKENS - keep it private and delete it when you are sure),
the ids of every row moved, the full contents of every row dropped, and
ready-to-run `undo_sql` statements per group.
NOTE: Render's shell disk is ephemeral. Copy the backup out (cat it, save it)
before you close the shell.

SAFE TO RE-RUN: the retired spare no longer shares an email with anyone, so a
second run finds nothing. Dry run by default (the connection is read-only);
--apply does everything in ONE transaction (any error rolls back everything).

Run on the Render shell:

    python merge_case_duplicate_accounts.py                      # dry run
    python merge_case_duplicate_accounts.py --apply --backup /tmp/merge_backup.json
    python merge_case_duplicate_accounts.py --skip-password-copy ...   # never copy a hash
"""
from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


class MergeError(RuntimeError):
    """An error raised by this script itself. Its message is written by us, holds
    only table / column names, counts and masked emails, and is safe to print.
    Anything else (above all database errors) is NEVER printed verbatim: those
    can echo bound parameters such as the password hash being copied."""

# ── What this script knows how to move ───────────────────────────────────────

# Plain ownership / attribution columns: the value is just "whose row is this",
# so moving it is `UPDATE ... SET col = keeper WHERE col = spare`. A column here
# is still refused at run time if a unique index covers it.
SIMPLE_COLUMNS: frozenset[tuple[str, str]] = frozenset({
    # Tarantuverse collection
    ("inverts", "user_id"), ("inverts", "bred_by_user_id"),
    ("tarantulas", "user_id"), ("scorpions", "user_id"), ("scorpion_colonies", "user_id"),
    ("colonies", "user_id"), ("colony_events", "user_id"), ("colony_events", "logged_by_user_id"),
    ("enclosures", "user_id"), ("feeder_colonies", "user_id"), ("feeder_care_logs", "user_id"),
    ("communal_incidents", "user_id"), ("pairings", "user_id"), ("egg_sacs", "user_id"),
    ("offspring", "user_id"), ("broods", "user_id"), ("clutches", "user_id"),
    ("expenses", "owner_id"), ("expenses", "created_by"),
    # Herpetoverse collection
    ("animals", "user_id"), ("animals", "bred_by_user_id"), ("animal_events", "user_id"),
    ("animal_events", "logged_by_user_id"), ("care_logs", "user_id"), ("care_logs", "logged_by_user_id"),
    ("hv_feeder_stocks", "user_id"), ("hv_feeder_logs", "user_id"),
    ("reptile_pairings", "user_id"), ("reptile_offspring", "user_id"),
    # "Logged by" on the shared log tables
    ("feeding_logs", "logged_by_user_id"), ("molt_logs", "logged_by_user_id"),
    ("photos", "logged_by_user_id"), ("shed_logs", "logged_by_user_id"),
    ("substrate_changes", "logged_by_user_id"), ("weight_logs", "logged_by_user_id"),
    # Community
    ("activity_feed", "user_id"), ("notifications", "user_id"),
    ("forum_posts", "author_id"), ("forum_threads", "author_id"),
    ("forum_threads", "last_post_user_id"),
    ("card_links", "owner_id"), ("card_links", "created_by"),
    # Who submitted a catalog entry
    ("species", "submitted_by"), ("invert_species", "submitted_by"),
    ("scorpion_species", "submitted_by"), ("herp_species", "submitted_by"),
})


@dataclass(frozen=True)
class Rule:
    """Tables where the spare's rows can collide with the keeper's.

    keys  - the OTHER columns of the unique key (with the user column). None =
            at most one row per user, so any keeper row is a collision.
    other - a column holding another user; if it points at the keeper or the
            spare, moving the row would make an account relate to itself.
    """
    keys: tuple[str, ...] | None
    other: str | None = None


CONFLICT_RULES: dict[tuple[str, str], Rule] = {
    ("notification_preferences", "user_id"): Rule(None),
    ("user_theme_preferences", "user_id"): Rule(None),
    ("user_achievements", "user_id"): Rule(("achievement_id",)),
    ("species_shortlist", "user_id"): Rule(("species_id",)),
    ("follows", "follower_id"): Rule(("followed_id",), other="followed_id"),
    ("follows", "followed_id"): Rule(("follower_id",), other="follower_id"),
    ("user_blocks", "blocker_id"): Rule(("blocked_id",), other="blocked_id"),
    ("user_blocks", "blocked_id"): Rule(("blocker_id",), other="blocker_id"),
}

OAUTH = ("user_oauth_accounts", "user_id")
REFERRED_BY = ("users", "referred_by_user_id")

# Columns blanked on the retired spare so nothing can sign in to it or reset it.
RETIRE_CLEARS = (
    "hashed_password", "reset_token", "reset_token_expires_at",
    "verification_token", "verification_token_expires_at",
    "oauth_provider", "oauth_id", "oauth_access_token", "oauth_refresh_token",
)


# ── Small helpers ────────────────────────────────────────────────────────────

def _ident(name: str) -> str:
    if not _IDENT.match(name):
        raise MergeError(f"bad identifier: {name!r}")
    return f'"{name}"'


def _qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _qtable(table: str) -> str:
    """A table from fk_columns: plain name (current schema) or 'schema.table'."""
    return ".".join(_qident(p) for p in table.split(".", 1))


def _lit(v) -> str:
    return "'" + str(v).replace("'", "''") + "'"


def mask_email(email: str | None) -> str:
    """k***@gmail.com - never print a whole address."""
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.strip().rpartition("@")
    return f"{local[:1]}***@{domain}"


def _json(conn, sql: str, params: dict | None = None) -> list[dict]:
    """Rows as dicts via to_jsonb(...)::text, so every column keeps its JSON
    shape and the same dict can be written to the backup and read back."""
    return [json.loads(r[0]) for r in conn.execute(text(sql), params or {}).all()]


# ── Schema discovery ─────────────────────────────────────────────────────────

# pg_catalog is the source of truth: it shows every constraint whatever the
# role, in every schema, and keys them by table (constraint names are not unique
# across tables). information_schema is kept only as a cross-check that WARNS.
_FK_PG_SQL = """
select n.nspname, cl.relname, a.attname, cardinality(c.conkey)
from pg_constraint c
join pg_class cl on cl.oid = c.conrelid
join pg_namespace n on n.oid = cl.relnamespace
cross join lateral unnest(c.conkey) as k(attnum)
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
where c.contype = 'f'
  and c.confrelid = (select t.oid from pg_class t join pg_namespace tn on tn.oid = t.relnamespace
                     where t.relname = 'users' and tn.nspname = current_schema() and t.relkind in ('r', 'p'))
"""

_FK_INFO_SQL = """
select kcu.table_name, kcu.column_name
from information_schema.referential_constraints rc
join information_schema.key_column_usage kcu
  on kcu.constraint_schema = rc.constraint_schema and kcu.constraint_name = rc.constraint_name
join information_schema.table_constraints ref
  on ref.constraint_schema = rc.unique_constraint_schema and ref.constraint_name = rc.unique_constraint_name
where rc.constraint_schema = current_schema() and kcu.table_schema = current_schema()
  and ref.table_schema = current_schema() and ref.table_name = 'users'
"""


def fk_columns(conn) -> list[tuple[str, str]]:
    """Every (table, column) that references users.id, found at run time from
    pg_catalog. A table in another schema is named 'schema.table'; this script
    handles none of those, so a spare with rows there aborts its group (the
    table is listed) instead of those rows being missed."""
    cur = conn.execute(text("select current_schema()")).scalar()
    rows = conn.execute(text(_FK_PG_SQL)).all()
    composite = sorted({f"{sch}.{t}" for sch, t, _c, n in rows if n > 1})
    if composite:
        raise MergeError(f"A composite foreign key references users in {composite}; this script can't reason about it.")
    fks: set[tuple[str, str]] = set()
    for sch, t, c, _n in rows:
        if "." in sch or "." in t:
            raise MergeError(f"Unsupported name with a dot: {sch}.{t}")
        if sch == cur:
            _ident(t), _ident(c)  # fail loudly on anything odd rather than skip it
            fks.add((t, c))
        else:
            fks.add((f"{sch}.{t}", c))
    if ("inverts", "user_id") not in fks:
        raise MergeError("inverts.user_id was not found - wrong schema/database?")
    return sorted(fks)


def fk_crosscheck_warning(conn, fks) -> str | None:
    """Compare with information_schema. Only ever a WARNING: that view hides what
    the role may not see and can pair constraints wrongly when two tables share a
    constraint name, so a difference is not a reason to stop."""
    try:
        with conn.begin_nested():  # a failure here must not poison the transaction
            info = {(t, c) for t, c in conn.execute(text(_FK_INFO_SQL)).all()}
    except Exception as e:  # noqa: BLE001 - advisory only
        return f"could not cross-check foreign keys against information_schema ({type(e).__name__}); pg_catalog was used"
    here = {(t, c) for t, c in fks if "." not in t}
    if info == here:
        return None
    return ("information_schema and pg_catalog disagree about what references users "
            f"(only in information_schema {sorted(info - here)}, only in pg_catalog {sorted(here - info)}); "
            "pg_catalog was used. This is a warning only.")


def pk_columns(conn, table: str) -> list[str]:
    return [r[0] for r in conn.execute(text(
        "select kcu.column_name from information_schema.table_constraints tc "
        "join information_schema.key_column_usage kcu on kcu.constraint_schema = tc.constraint_schema "
        "and kcu.constraint_name = tc.constraint_name and kcu.table_name = tc.table_name "
        "where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = current_schema() "
        "and tc.table_name = :t order by kcu.ordinal_position"
    ), {"t": table}).all()]


def unique_indexes_on(conn, table: str, col: str) -> list[str]:
    return [r[0] for r in conn.execute(text(
        "select pg_get_indexdef(i.indexrelid) from pg_index i "
        "join pg_class t on t.oid = i.indrelid join pg_namespace n on n.oid = t.relnamespace "
        "join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey::int2[]) "
        "where i.indisunique and n.nspname = current_schema() and t.relname = :t and a.attname = :c"
    ), {"t": table, "c": col}).all()]


# ── Finding groups, choosing the keeper ──────────────────────────────────────

def find_groups(conn) -> list[tuple[str, list[dict]]]:
    """Groups of users (active or not) sharing lower(email) - the same key the
    API looks accounts up by (no trimming, so addresses that differ by spaces
    are different accounts here too)."""
    rows = conn.execute(text(
        "select id, email, username, is_active, created_at, lower(email) as k from users "
        "where lower(email) in (select lower(email) from users group by 1 having count(*) > 1) "
        "order by k, created_at, id"
    )).mappings().all()
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(r["k"], []).append({
            "id": str(r["id"]), "email": r["email"], "username": r["username"],
            "is_active": r["is_active"], "created_at": r["created_at"],
        })
    return list(groups.items())


def inventory(conn, fks, user_id: str) -> dict[tuple[str, str], int]:
    """How many rows reference this user, per FK column (non-zero only)."""
    out: dict[tuple[str, str], int] = {}
    for table, col in fks:
        n = conn.execute(text(f"select count(*) from {_qtable(table)} where {_qident(col)} = :u"),
                         {"u": user_id}).scalar() or 0
        if n:
            out[(table, col)] = n
    return out


def _ts(a: dict):
    c = a.get("created_at")
    return (1, 0.0) if c is None else (0, c.timestamp())


def choose_keeper(a: dict, b: dict) -> tuple[dict, dict, str]:
    """a, b: {id, created_at, rows, animals}. Returns (keeper, spare, why)."""
    if a["rows"] != b["rows"]:
        k, s = (a, b) if a["rows"] > b["rows"] else (b, a)
        return k, s, f"more rows reference it ({k['rows']} vs {s['rows']})"
    if (a["animals"] > 0) != (b["animals"] > 0):
        k, s = (a, b) if a["animals"] > 0 else (b, a)
        return k, s, f"tied on rows ({a['rows']}); only it owns animals"
    if _ts(a) != _ts(b):
        k, s = (a, b) if _ts(a) < _ts(b) else (b, a)
        return k, s, "tied on rows and animals; it is the older account"
    k, s = sorted((a, b), key=lambda x: x["id"])
    return k, s, "tied on everything; lower id"


# ── The plan for one group ───────────────────────────────────────────────────

@dataclass
class Stmt:
    sql: str
    params: dict
    expect: int | None = None  # rows it must change, else the run aborts


@dataclass
class Move:
    table: str
    column: str
    pk: list[str]
    ids: list[list[str]]  # primary-key values BEFORE the move

    @property
    def count(self) -> int:
        return len(self.ids)


@dataclass
class Drop:
    table: str
    column: str
    reason: str
    row: dict


@dataclass
class GroupPlan:
    key: str
    accounts: list[dict]
    status: str = "ok"            # ok | aborted | skipped
    keeper: dict | None = None
    spare: dict | None = None
    why: str = ""
    moves: list[Move] = field(default_factory=list)
    drops: list[Drop] = field(default_factory=list)
    statements: list[Stmt] = field(default_factory=list)
    credentials: list[str] = field(default_factory=list)
    spare_rows: dict[str, int] = field(default_factory=dict)  # what the spare references, per table.column
    warnings: list[str] = field(default_factory=list)
    aborts: list[str] = field(default_factory=list)
    keeper_before: dict | None = None
    spare_before: dict | None = None
    _seen: set = field(default_factory=set)

    @property
    def label(self) -> str:
        return mask_email(self.accounts[0]["email"]) if self.accounts else "?"

    def abort(self, why: str) -> None:
        self.aborts.append(why)
        self.status = "aborted"


def _pk_where(pk: list[str]) -> str:
    return " and ".join(f"{_ident(c)} = :pk{i}" for i, c in enumerate(pk))


def _pk_params(pk: list[str], row: dict) -> dict:
    return {f"pk{i}": row[c] for i, c in enumerate(pk)}


def _plan_simple(conn, plan: GroupPlan, table: str, col: str, n: int, k: str, s: str) -> None:
    pk = pk_columns(conn, table)
    if not pk:
        plan.abort(f"{table}.{col}: {n} row(s), but the table has no primary key to record them by")
        return
    if unique_indexes_on(conn, table, col):
        plan.abort(f"{table}.{col}: {n} row(s), but a unique index covers the column so a plain move could collide")
        return
    cols = ", ".join(_ident(c) for c in pk)
    ids = [[str(v) for v in r] for r in conn.execute(text(
        f"select {cols} from {_ident(table)} where {_ident(col)} = :s order by {cols}"), {"s": s}).all()]
    if len(ids) != n:
        raise MergeError(f"{table}.{col}: counted {n} then read {len(ids)} rows")
    plan.moves.append(Move(table, col, pk, ids))
    plan.statements.append(Stmt(
        f"update {_ident(table)} set {_ident(col)} = :k where {_ident(col)} = :s", {"k": k, "s": s}, n))


def _plan_conflict(conn, plan: GroupPlan, table: str, col: str, rule: Rule, k: str, s: str) -> None:
    pk = pk_columns(conn, table)
    if not pk:
        plan.abort(f"{table}.{col}: the table has no primary key to record rows by")
        return
    spare_rows = _json(conn, f"select to_jsonb(t)::text from {_ident(table)} t where {_ident(col)} = :s", {"s": s})
    keeper_rows = _json(conn, f"select to_jsonb(t)::text from {_ident(table)} t where {_ident(col)} = :k", {"k": k})
    if rule.keys is None:
        keeper_keys = {()} if keeper_rows else set()
    else:
        keeper_keys = {tuple(r[c] for c in rule.keys) for r in keeper_rows}
    moved: list[list[str]] = []
    for row in spare_rows:
        ident = (table, tuple(str(row[c]) for c in pk))
        if ident in plan._seen:  # e.g. a follow from the spare to itself, seen from both columns
            continue
        plan._seen.add(ident)
        key = () if rule.keys is None else tuple(row[c] for c in rule.keys)
        if rule.other and row[rule.other] in (k, s):
            reason = "would relate the account to itself"
        elif key in keeper_keys:
            reason = "the keeper already has the same row" if rule.keys is not None else "the keeper already has one"
        else:
            reason = None
        where = _pk_where(pk)
        params = _pk_params(pk, row)
        if reason:
            plan.drops.append(Drop(table, col, reason, row))
            plan.statements.append(Stmt(f"delete from {_ident(table)} where {where}", params, 1))
        else:
            moved.append([str(row[c]) for c in pk])
            plan.statements.append(Stmt(
                f"update {_ident(table)} set {_ident(col)} = :k where {where}", {**params, "k": k}, 1))
    if moved:
        plan.moves.append(Move(table, col, pk, moved))


def _plan_referrals(conn, plan: GroupPlan, k: str, s: str) -> None:
    ids = [str(r[0]) for r in conn.execute(text(
        "select id from users where referred_by_user_id = :s order by id"), {"s": s}).all()]
    others = [i for i in ids if i != k]
    if others:
        plan.moves.append(Move("users", "referred_by_user_id", ["id"], [[i] for i in others]))
        plan.statements.append(Stmt(
            "update users set referred_by_user_id = :k where referred_by_user_id = :s and id <> :k",
            {"k": k, "s": s}, len(others)))
    if k in ids:  # the keeper was referred by its own duplicate
        plan.statements.append(Stmt("update users set referred_by_user_id = null where id = :k", {"k": k}, 1))
        plan.warnings.append("the keeper's 'referred by' pointed at the spare (cleared when the merge runs)")


def _plan_credentials(conn, plan: GroupPlan, k: str, s: str, skip_password_copy: bool = False) -> None:
    kb, sb = plan.keeper_before, plan.spare_before
    keeper_sets: dict[str, object] = {}

    # Password.
    if skip_password_copy:
        plan.credentials.append("--skip-password-copy: no password hash is copied in this group")
    if sb["hashed_password"] and not kb["hashed_password"]:
        if skip_password_copy:
            plan.credentials.append(
                "password hash NOT copied (--skip-password-copy): the spare had a password and the keeper has none; "
                "the keeper keeps signing in with Google/Apple only")
        else:
            keeper_sets["hashed_password"] = sb["hashed_password"]
            plan.credentials.append("password hash carried from the spare to the keeper (the keeper had none)")
    elif sb["hashed_password"] and kb["hashed_password"] and sb["hashed_password"] != kb["hashed_password"]:
        plan.warnings.append(
            "both accounts had passwords: the keeper's was kept and the spare's was NOT carried "
            "(the keeper can use 'Forgot password')")
    elif kb["hashed_password"]:
        plan.credentials.append("the keeper's password was kept")

    # Verified.
    if sb["is_verified"] and not kb["is_verified"]:
        keeper_sets["is_verified"] = True
        plan.credentials.append("keeper marked verified (the spare was)")

    # Social sign-in links (the rows sign-in actually looks up).
    keeper_links = _json(conn, "select to_jsonb(t)::text from user_oauth_accounts t where user_id = :u", {"u": k})
    spare_links = _json(conn, "select to_jsonb(t)::text from user_oauth_accounts t where user_id = :u", {"u": s})
    kprov = {r["provider"].lower(): r["provider_account_id"] for r in keeper_links}
    kleg = (kb["oauth_provider"].lower(), kb["oauth_id"]) if kb["oauth_provider"] and kb["oauth_id"] else None
    ok_rows = True
    for r in spare_links:
        p, i = r["provider"].lower(), r["provider_account_id"]
        if p in kprov:
            plan.abort(f"both accounts have a {p} sign-in link; merging them would drop one identity")
            ok_rows = False
        elif kleg and kleg[0] == p and kleg[1] != i:
            plan.abort(f"the keeper's legacy {p} sign-in is a different identity from the spare's {p} link")
            ok_rows = False
    if spare_links and ok_rows:
        plan.moves.append(Move("user_oauth_accounts", "user_id", ["id"], [[str(r["id"])] for r in spare_links]))
        plan.statements.append(Stmt(
            "update user_oauth_accounts set user_id = :k where user_id = :s", {"k": k, "s": s}, len(spare_links)))
        plan.credentials.append("moved sign-in link(s): " + ", ".join(sorted(r["provider"] for r in spare_links)))
    if keeper_links:
        plan.credentials.append("keeper keeps sign-in link(s): " + ", ".join(sorted(r["provider"] for r in keeper_links)))

    # The legacy single-provider columns on users.
    if sb["oauth_provider"] and sb["oauth_id"]:
        p, i = sb["oauth_provider"].lower(), sb["oauth_id"]
        moving = {(r["provider"].lower(), r["provider_account_id"]) for r in spare_links}
        if (p, i) in moving or kprov.get(p) == i or kleg == (p, i):
            pass  # already covered
        elif p in kprov or (kleg and kleg[0] == p):
            plan.abort(f"the spare's legacy {p} sign-in is a different identity from the keeper's")
        elif kleg is None:
            keeper_sets.update(oauth_provider=sb["oauth_provider"], oauth_id=sb["oauth_id"],
                               oauth_access_token=sb["oauth_access_token"],
                               oauth_refresh_token=sb["oauth_refresh_token"])
            plan.credentials.append(f"legacy {p} sign-in columns copied to the keeper")
        else:
            plan.abort(f"the spare has a legacy {p} sign-in and the keeper a legacy {kleg[0]} one; "
                       "there is no column to put it in")

    # Retire the spare FIRST (it frees any value the keeper takes over), then update the keeper.
    placeholder = f"merged-{s}@merged.invalid"
    clears = ", ".join(f"{c} = null" for c in RETIRE_CLEARS)
    plan.statements.append(Stmt(
        f"update users set email = :e, is_active = false, collection_visibility = 'private', {clears} where id = :s", {"e": placeholder, "s": s}, 1))
    if keeper_sets:
        sets = ", ".join(f"{_ident(c)} = :v_{c}" for c in keeper_sets)
        plan.statements.append(Stmt(
            f"update users set {sets} where id = :k", {"k": k, **{f"v_{c}": v for c, v in keeper_sets.items()}}, 1))

    # Things worth a human's eye.
    for flag in ("is_admin", "is_superuser", "is_breeder"):
        if sb.get(flag) and not kb.get(flag):
            plan.warnings.append(f"the spare was {flag} and the keeper is not; nothing was changed")
    if kb["is_active"] is False:
        plan.warnings.append("the keeper account is inactive; it was left that way")


def plan_group(conn, fks, key: str, accounts: list[dict], lock: bool = False,
               skip_password_copy: bool = False) -> GroupPlan:
    plan = GroupPlan(key=key, accounts=accounts)
    if len(accounts) != 2:
        plan.status = "skipped"
        plan.aborts.append(f"{len(accounts)} accounts share this email; only pairs are merged (not guessing)")
        return plan
    if lock:  # also blocks child inserts for these users until we finish
        a, b = sorted(x["id"] for x in accounts)
        conn.execute(text("select id from users where id in (:a, :b) order by id for update"), {"a": a, "b": b})

    infos = []
    counts = {}
    for acct in accounts:
        inv = inventory(conn, fks, acct["id"])
        counts[acct["id"]] = inv
        infos.append({**acct, "rows": sum(inv.values()), "animals": inv.get(("inverts", "user_id"), 0)})
    keeper, spare, plan.why = choose_keeper(*infos)
    plan.keeper, plan.spare = keeper, spare
    plan.spare_rows = {f"{t}.{c}": n for (t, c), n in sorted(counts[spare["id"]].items())}
    k, s = keeper["id"], spare["id"]
    plan.keeper_before = _json(conn, "select to_jsonb(u)::text from users u where id = :i", {"i": k})[0]
    plan.spare_before = _json(conn, "select to_jsonb(u)::text from users u where id = :i", {"i": s})[0]

    unhandled: list[str] = []
    for (table, col), n in sorted(counts[s].items()):
        if (table, col) in CONFLICT_RULES:
            _plan_conflict(conn, plan, table, col, CONFLICT_RULES[(table, col)], k, s)
        elif (table, col) == OAUTH:
            pass  # handled with the credentials, below
        elif (table, col) == REFERRED_BY:
            _plan_referrals(conn, plan, k, s)
        elif (table, col) in SIMPLE_COLUMNS:
            _plan_simple(conn, plan, table, col, n, k, s)
        else:
            unhandled.append(f"{table}.{col} ({n})")
    if unhandled:
        plan.abort("the spare has rows in tables this script does not move: " + ", ".join(unhandled)
                   + ". Resolve it by hand.")
    _plan_credentials(conn, plan, k, s, skip_password_copy)
    return plan


# ── Execute, back up ─────────────────────────────────────────────────────────

def execute_plan(conn, plan: GroupPlan) -> None:
    for st in plan.statements:
        res = conn.execute(text(st.sql), st.params)
        if st.expect is not None and res.rowcount != st.expect:
            raise MergeError(
                f"{plan.label}: expected to change {st.expect} row(s), changed {res.rowcount}: {st.sql[:90]}")


def _undo_move(m: Move, keeper: str, spare: str) -> list[str]:
    # After the move the key columns that ARE the user column hold the keeper.
    post = [[keeper if c == m.column else v for c, v in zip(m.pk, row)] for row in m.ids]
    t, c = _ident(m.table), _ident(m.column)
    if len(m.pk) == 1:
        return [f"update {t} set {c} = {_lit(spare)} where {_ident(m.pk[0])} in ({', '.join(_lit(r[0]) for r in chunk)});"
                for chunk in (post[i:i + 500] for i in range(0, len(post), 500))]
    return [f"update {t} set {c} = {_lit(spare)} where "
            + " and ".join(f"{_ident(pc)} = {_lit(v)}" for pc, v in zip(m.pk, row)) + ";" for row in post]


def _restore_user(row: dict) -> str:
    cols = list(row)
    sets = ", ".join(f"{_ident(c)} = r.{_ident(c)}" for c in cols)
    return (f'update "users" u set {sets} from jsonb_populate_record(null::"users", '
            f"$bk${json.dumps(row)}$bk$::jsonb) r where u.\"id\" = r.\"id\";")


def undo_statements(plan: GroupPlan) -> list[str]:
    k, s = plan.keeper["id"], plan.spare["id"]
    out = [_restore_user(plan.spare_before), _restore_user(plan.keeper_before)]
    for m in plan.moves:
        out += _undo_move(m, k, s)
    for d in plan.drops:
        out.append(f"insert into {_ident(d.table)} select * from jsonb_populate_record("
                   f"null::{_ident(d.table)}, $bk${json.dumps(d.row)}$bk$::jsonb);")
    return out


def backup_payload(plans: list[GroupPlan]) -> dict:
    return {
        "format": 1,
        "script": "merge_case_duplicate_accounts.py",
        "written_at": datetime.now(timezone.utc).isoformat(),
        "WARNING": "Contains password hashes and OAuth tokens. Keep it private; delete it once the merge is confirmed.",
        "how_to_undo": "Run each group's undo_sql, in order, in one transaction (psql). The users rows are restored "
                       "from keeper_before / spare_before, moved rows go back to the spare, dropped rows are re-inserted. "
                       "Undo writes back WHOLE users rows, so it is only clean soon after the merge: anything either "
                       "account changed since (a password reset, a profile edit) is lost.",
        "groups": [{
            "keeper_id": p.keeper["id"], "spare_id": p.spare["id"], "why": p.why,
            "keeper_before": p.keeper_before, "spare_before": p.spare_before,
            "moved": [{"table": m.table, "column": m.column, "pk": m.pk, "ids": m.ids} for m in p.moves],
            "dropped": [{"table": d.table, "column": d.column, "reason": d.reason, "row": d.row} for d in p.drops],
            "undo_sql": undo_statements(p),
        } for p in plans],
    }


def write_backup(path: str, plans: list[GroupPlan]) -> None:
    """Refuses to overwrite. Written and flushed to disk before any change."""
    data = json.dumps(backup_payload(plans), indent=2, default=str)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    with open(path, encoding="utf-8") as f:  # read it back: a backup we can't read is no backup
        if len(json.load(f)["groups"]) != len(plans):
            raise MergeError(f"backup {path} did not read back correctly")


# ── Run ──────────────────────────────────────────────────────────────────────

@dataclass
class MergeResult:
    apply: bool
    plans: list[GroupPlan] = field(default_factory=list)
    backup_path: str | None = None

    @property
    def merged(self) -> list[GroupPlan]:
        return [p for p in self.plans if p.status == "ok"]

    @property
    def problems(self) -> list[GroupPlan]:
        return [p for p in self.plans if p.status != "ok"]

    @property
    def exit_code(self) -> int:
        return 2 if self.problems else 0


def describe(plan: GroupPlan, n: int, total: int, apply: bool) -> list[str]:
    head = f"Group {n} of {total}: {plan.label}"
    if plan.status == "skipped":
        ids = ", ".join(f"{a['id']} ({mask_email(a['email'])})" for a in plan.accounts)
        return [head, f"  SKIPPED: {plan.aborts[0]}", f"  accounts: {ids}"]
    k, s = plan.keeper, plan.spare
    lines = [
        head,
        f"  keeper: {k['id']}  {mask_email(k['email'])}  ({k['rows']} rows, {k['animals']} animals)",
        f"  spare : {s['id']}  {mask_email(s['email'])}  ({s['rows']} rows, {s['animals']} animals)",
        f"  keeper chosen because {plan.why}",
    ]
    if plan.status == "aborted":
        # Say what was FOUND and that nothing changed. No "moved" / "carried" /
        # "owns nothing": the pair was refused, so none of that happened.
        if plan.spare_rows:
            lines.append("  found on the spare (nothing was changed):")
            lines += [f"    {name:42} {cnt:5}" for name, cnt in plan.spare_rows.items()]
        else:
            lines.append("  found on the spare: no rows in any table that references users (nothing was changed)")
        for a in plan.aborts:
            lines.append(f"  ABORTED (nothing written for this pair): {a}")
        for w in plan.warnings:
            lines.append(f"  WARNING: {w}")
        lines.append("  this pair was left exactly as it was")
        return lines
    moved: dict[str, int] = {}
    for m in plan.moves:
        moved[f"{m.table}.{m.column}"] = moved.get(f"{m.table}.{m.column}", 0) + m.count
    if moved:
        lines.append(f"  rows {'moved' if apply else 'that would move'} to the keeper:")
        lines += [f"    {name:42} {cnt:5}" for name, cnt in sorted(moved.items())]
    elif plan.spare_rows:
        lines.append("  no rows to move to the keeper")
    else:
        lines.append("  no rows to move (the spare owns nothing)")
    if plan.drops:
        lines.append(f"  rows {'dropped' if apply else 'that would be dropped'} "
                     "(duplicates / self-references; kept in the backup):")
        for d in plan.drops:
            lines.append(f"    {d.table}.{d.column}: {d.reason}")
    for c in plan.credentials:
        lines.append(f"  credentials: {c}")
    lines.append(f"  the spare {'would be' if not apply else 'was'} retired: email replaced, deactivated, "
                 "made private, password and tokens cleared (row kept)")
    for w in plan.warnings:
        lines.append(f"  WARNING: {w}")
    return lines


def merge_accounts(conn, apply: bool, backup_path: str | None = None,
                   out: Callable[[str], None] = print, skip_password_copy: bool = False) -> MergeResult:
    """Plan every group, then (apply only) back up and execute. All-or-nothing:
    the writes sit in a SAVEPOINT, so any error undoes every group."""
    if apply and not backup_path:
        raise ValueError("apply needs a backup path")
    result = MergeResult(apply=apply)
    fks = fk_columns(conn)
    warning = fk_crosscheck_warning(conn, fks)
    if warning:
        out(f"WARNING: {warning}\n")
    groups = find_groups(conn)
    if not groups:
        out("No two accounts share an email apart from letter case. Nothing to do.")
        return result

    with (conn.begin_nested() if apply else contextlib.nullcontext()):
        for key, accts in groups:
            result.plans.append(plan_group(conn, fks, key, accts, lock=apply, skip_password_copy=skip_password_copy))
        ready = result.merged
        if apply and ready:
            write_backup(backup_path, ready)
            result.backup_path = backup_path
            for p in ready:
                execute_plan(conn, p)

    for i, p in enumerate(result.plans, 1):
        for line in describe(p, i, len(result.plans), apply):
            out(line)
    out("")
    out(f"{len(result.plans)} group(s) found: {len(result.merged)} {'merged' if apply else 'can be merged'}, "
        f"{len(result.problems)} need a human.")
    if apply and not result.merged:
        out("Nothing was changed and no backup file was written.")
    return result


def check_args(apply: bool, backup: str | None) -> None:
    if apply and not backup:
        raise SystemExit("--apply needs --backup FILE (a new file; it holds the originals so the merge can be undone).")
    if backup:
        if os.path.exists(backup):
            raise SystemExit(f"{backup} already exists; refusing to overwrite a backup. Choose a new file name.")
        folder = os.path.dirname(os.path.abspath(backup))
        if not os.path.isdir(folder) or not os.access(folder, os.W_OK):
            raise SystemExit(f"Can't write to {folder}.")


def safe_error_text(e: BaseException) -> str:
    """What may be printed about a failure. Never str(e) for anything but our own
    MergeError: SQLAlchemy database errors append '[parameters: ...]' and the
    driver message can quote row values, so a failed UPDATE of the keeper could
    print the password hash being copied (or an email, a token)."""
    if isinstance(e, MergeError):
        return str(e)
    if isinstance(e, SQLAlchemyError):
        orig = getattr(e, "orig", None)
        code = getattr(orig, "pgcode", None) or getattr(orig, "sqlstate", None)
        kind = type(e).__name__ + (f" ({type(orig).__name__}" + (f", SQLSTATE {code}" if code else "") + ")" if orig is not None else "")
        return (f"{kind}: the database refused the change. Details are not printed because a database error can "
                "repeat the values being written (such as a password hash).")
    return f"{type(e).__name__}: unexpected failure (details are not printed; they could contain account data)."


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    ap.add_argument("--backup", help="JSON file for the originals (required with --apply; must not exist)")
    ap.add_argument("--skip-password-copy", action="store_true",
                    help="never copy a password hash from the spare to the keeper (a password-less keeper "
                         "keeps signing in with Google/Apple only)")
    args = ap.parse_args(argv)
    check_args(args.apply, args.backup)

    from app.database import engine

    print("Merging accounts whose emails differ only by letter case"
          f"{'' if args.apply else '   (DRY RUN - nothing is written)'}"
          f"{'   (--skip-password-copy: no password hash is copied)' if args.skip_password_copy else ''}\n")
    try:
        if args.apply:
            with engine.begin() as conn:  # one transaction: all or nothing
                result = merge_accounts(conn, True, args.backup, skip_password_copy=args.skip_password_copy)
        else:
            with engine.connect() as conn:
                conn.execute(text("set transaction read only"))
                result = merge_accounts(conn, False, skip_password_copy=args.skip_password_copy)
    except Exception as e:
        print(f"\nERROR: {safe_error_text(e)}\nEverything was rolled back; no account was changed.")
        if args.backup and os.path.exists(args.backup):
            print(f"The backup file {args.backup} was written before the failure and describes a change that did NOT "
                  "happen. Delete it before re-running.")
        return 1

    if args.apply and result.backup_path:
        print(f"\nBackup written to {result.backup_path} (private: it holds password hashes). Render's disk is "
              "temporary - copy it somewhere safe now.")
    elif not args.apply and result.merged:
        print("\nLooks right? Run again with:  --apply --backup /tmp/merge_backup.json")
    return result.exit_code


if __name__ == "__main__":
    sys.exit(main())

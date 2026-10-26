"""Move every stored photo link from the bucket's old address to the new one.

WHY
---
Until 2026-10 photos were served from the R2 bucket's r2.dev address, which
Cloudflare rate-limits and doesn't recommend for production. The same bucket
is now also served at photos.tarantuverse.com (R2 custom domain), and new
uploads use it (R2_PUBLIC_URL). The FILES don't move — only the address in
front of them changes — so this rewrites the leading address of every stored
link. The keys after it stay byte-for-byte the same.

WHAT IT TOUCHES
---------------
Plain link columns (only links that START with the old address + "/"):
  photos.url, photos.thumbnail_url, inverts/tarantulas/scorpions/animals/
  colonies.photo_url, users.avatar_url, invert_species/species.image_url
JSON columns (the old address + "/" is replaced wherever it appears):
  activity_feed.activity_metadata (thumbnails in feed items),
  card_links.payload (frozen share-card snapshots — only the photo host
  changes; nothing else in a snapshot is rewritten)
Afterwards it scans EVERY text/JSON column in the database for the old
address and reports anything left, so a column added later can't be missed
silently.

Raw SQL on purpose: no `updated_at` moves, no ORM hooks run, nothing a keeper
would see as an edit.

SAFE TO RE-RUN: a second run finds nothing to change. Dry run by default; the
whole write is ONE transaction, so it either moves everything or nothing.

ORDER (see CLAUDE.md "Photos on photos.tarantuverse.com"):
  1. photos.tarantuverse.com attached to the bucket and serving photos
  2. R2_PUBLIC_URL on Render = https://photos.tarantuverse.com (redeploy)
  3. this script — dry run, then --apply
  4. only then turn off the bucket's r2.dev address

Run on the Render shell:

    python rewrite_photo_urls.py            # dry run: counts only
    python rewrite_photo_urls.py --apply    # do it
"""
from __future__ import annotations

import argparse
import re
import sys
from typing import Iterable, Sequence

from sqlalchemy import text

# Link columns: the value IS the link.
LINK_COLUMNS: list[tuple[str, str]] = [
    ("photos", "url"),
    ("photos", "thumbnail_url"),
    ("inverts", "photo_url"),
    ("tarantulas", "photo_url"),
    ("scorpions", "photo_url"),
    ("animals", "photo_url"),
    ("colonies", "photo_url"),
    ("users", "avatar_url"),
    ("invert_species", "image_url"),
    ("species", "image_url"),
]

# JSON columns: links live somewhere inside the document.
JSON_COLUMNS: list[tuple[str, str]] = [
    ("activity_feed", "activity_metadata"),
    ("card_links", "payload"),
]

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def _ident(name: str) -> str:
    if not _IDENT.match(name):
        raise ValueError(f"bad identifier: {name!r}")
    return f'"{name}"'


def _prefix(base: str) -> str:
    return base.rstrip("/") + "/"


def count_links(conn, table: str, col: str, old: str) -> int:
    sql = f"select count(*) from {_ident(table)} where left({_ident(col)}, length(:p)) = :p"
    return conn.execute(text(sql), {"p": _prefix(old)}).scalar() or 0


def check_fits(conn, table: str, col: str, old: str, new: str) -> None:
    """A varchar(n) column must still fit every link after the swap."""
    grow = len(_prefix(new)) - len(_prefix(old))
    if grow <= 0:
        return
    # Resolve the table the same way the UPDATE will (search_path), and read
    # varchar(n)'s n from its type modifier (n + 4; -1 = no limit).
    limit = conn.execute(text(
        "select case when t.typname in ('varchar', 'bpchar') and a.atttypmod > 0 "
        "then a.atttypmod - 4 end "
        "from pg_attribute a join pg_type t on t.oid = a.atttypid "
        "where a.attrelid = to_regclass(:t) and a.attname = :c"
    ), {"t": table, "c": col}).scalar()
    if not limit:
        return
    longest = conn.execute(text(
        f"select max(length({_ident(col)})) from {_ident(table)} "
        f"where left({_ident(col)}, length(:p)) = :p"
    ), {"p": _prefix(old)}).scalar() or 0
    if longest + grow > limit:
        raise RuntimeError(f"{table}.{col}: a link would be {longest + grow} chars, the column holds {limit}")


def rewrite_links(conn, table: str, col: str, old: str, new: str) -> int:
    check_fits(conn, table, col, old, new)
    sql = (
        f"update {_ident(table)} set {_ident(col)} = :np || substr({_ident(col)}, length(:p) + 1) "
        f"where left({_ident(col)}, length(:p)) = :p"
    )
    return conn.execute(text(sql), {"p": _prefix(old), "np": _prefix(new)}).rowcount


def count_json(conn, table: str, col: str, old: str) -> int:
    sql = f"select count(*) from {_ident(table)} where strpos({_ident(col)}::text, :p) > 0"
    return conn.execute(text(sql), {"p": _prefix(old)}).scalar() or 0


def rewrite_json(conn, table: str, col: str, old: str, new: str) -> int:
    sql = (
        f"update {_ident(table)} set {_ident(col)} = replace({_ident(col)}::text, :p, :np)::jsonb "
        f"where strpos({_ident(col)}::text, :p) > 0"
    )
    return conn.execute(text(sql), {"p": _prefix(old), "np": _prefix(new)}).rowcount


def leftovers(conn, old: str) -> list[tuple[str, str, int]]:
    """Every text/JSON/array column in the schema that still mentions the old
    address — whether or not this script knows the column."""
    cols = conn.execute(text(
        "select c.table_name, c.column_name from information_schema.columns c "
        "join information_schema.tables t on t.table_schema = c.table_schema "
        "and t.table_name = c.table_name and t.table_type = 'BASE TABLE' "
        "where c.table_schema = current_schema() "
        "and c.data_type in ('character varying', 'text', 'jsonb', 'json', 'ARRAY') "
        "order by 1, 2"
    )).all()
    found = []
    for table, col in cols:
        if not (_IDENT.match(table) and _IDENT.match(col)):
            continue
        n = conn.execute(text(
            f"select count(*) from {_ident(table)} where strpos({_ident(col)}::text, :o) > 0"
        ), {"o": old.rstrip("/")}).scalar() or 0
        if n:
            found.append((table, col, n))
    return found


def move(conn, olds: Sequence[str], new: str, apply: bool,
         link_columns: Iterable[tuple[str, str]] = LINK_COLUMNS,
         json_columns: Iterable[tuple[str, str]] = JSON_COLUMNS) -> dict:
    """Count (and with apply=True, rewrite) every link on every old address.
    Returns {"table.col": rows} for rows that start / contain an old address."""
    report: dict[str, int] = {}
    for old in olds:
        for table, col in link_columns:
            n = rewrite_links(conn, table, col, old, new) if apply else count_links(conn, table, col, old)
            if n:
                report[f"{table}.{col}"] = report.get(f"{table}.{col}", 0) + n
        for table, col in json_columns:
            n = rewrite_json(conn, table, col, old, new) if apply else count_json(conn, table, col, old)
            if n:
                report[f"{table}.{col}"] = report.get(f"{table}.{col}", 0) + n
    return report


def validate(olds: Sequence[str], new: str) -> None:
    new = new.rstrip("/")
    if not new.startswith("https://"):
        raise SystemExit("The new address must be an https URL (R2_PUBLIC_URL).")
    if new.split("/")[2].endswith(".r2.dev"):
        raise SystemExit(
            "R2_PUBLIC_URL still points at r2.dev. Attach photos.tarantuverse.com to the "
            "bucket, set R2_PUBLIC_URL to it on Render, redeploy, then run this."
        )
    if not olds:
        raise SystemExit("No old address to move from (R2_LEGACY_PUBLIC_URLS is empty).")
    if new in [o.rstrip("/") for o in olds]:
        raise SystemExit("The new address is listed as an old one.")


def main(argv=None) -> int:
    from app.config import settings
    from app.database import engine

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    ap.add_argument("--to", default=settings.R2_PUBLIC_URL, help="new address (default: R2_PUBLIC_URL)")
    ap.add_argument("--from", dest="olds", default=settings.R2_LEGACY_PUBLIC_URLS,
                    help="old address(es), comma-separated (default: R2_LEGACY_PUBLIC_URLS)")
    args = ap.parse_args(argv)

    new = (args.to or "").strip().rstrip("/")
    olds = [o.strip().rstrip("/") for o in (args.olds or "").split(",") if o.strip()]
    validate(olds, new)
    print(f"Moving links from {', '.join(olds)}\n                to {new}"
          f"{'' if args.apply else '   (DRY RUN — nothing is written)'}")

    if args.apply:
        with engine.begin() as conn:  # one transaction: all or nothing
            report = move(conn, olds, new, apply=True)
    else:
        with engine.connect() as conn:
            report = move(conn, olds, new, apply=False)

    for name, n in sorted(report.items()):
        print(f"  {name:38} {n:6} {'moved' if args.apply else 'to move'}")
    print(f"  {'total':38} {sum(report.values()):6}")

    with engine.connect() as conn:
        left = [x for old in olds for x in leftovers(conn, old)]
    known = {f"{t}.{c}" for t, c in LINK_COLUMNS + JSON_COLUMNS}
    unknown = [x for x in left if f"{x[0]}.{x[1]}" not in known]
    if args.apply:
        if left:
            print("Still mentioning an old address:")
            for t, c, n in left:
                print(f"  {t}.{c}: {n}")
            return 2
        print("Done. No stored link uses an old address any more.")
    elif unknown:
        print("Not covered by this script (would be left as they are):")
        for t, c, n in unknown:
            print(f"  {t}.{c}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

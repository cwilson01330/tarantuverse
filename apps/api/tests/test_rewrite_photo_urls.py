"""rewrite_photo_urls.py moves stored photo links to the bucket's new address.

Only the leading address changes, only on links that start with the old one;
JSON documents have it replaced wherever it appears; nothing is written on a
dry run; a second run finds nothing; a varchar that couldn't hold the longer
link stops the run; and the leftover scan finds the old address in columns
the script doesn't know about.
"""
import uuid

import pytest
from sqlalchemy import text

import rewrite_photo_urls as rw

OLD = "https://pub-739a81bdc01a40bb8cfce4a58b122d17.r2.dev"
NEW = "https://photos.tarantuverse.com"


# ── pure checks ──────────────────────────────────────────────────────────────

def test_refuses_to_run_before_r2_public_url_moves():
    with pytest.raises(SystemExit, match="still points at r2.dev"):
        rw.validate([OLD], OLD.replace("pub-739a", "pub-0000"))
    with pytest.raises(SystemExit, match="https"):
        rw.validate([OLD], "http://photos.tarantuverse.com")
    with pytest.raises(SystemExit, match="No old address"):
        rw.validate([], NEW)
    rw.validate([OLD], NEW)  # the real move is fine


def test_identifiers_are_never_interpolated_raw():
    with pytest.raises(ValueError):
        rw._ident('photos"; drop table users; --')


def test_every_column_holding_old_links_today_is_covered():
    """The columns found holding r2.dev links in production on 2026-10-26."""
    covered = {f"{t}.{c}" for t, c in rw.LINK_COLUMNS + rw.JSON_COLUMNS}
    assert covered >= {
        "photos.url", "photos.thumbnail_url", "inverts.photo_url", "tarantulas.photo_url",
        "scorpions.photo_url", "animals.photo_url", "colonies.photo_url", "users.avatar_url",
        "invert_species.image_url", "species.image_url",
        "activity_feed.activity_metadata", "card_links.payload",
    }


# ── against Postgres ─────────────────────────────────────────────────────────

pg = pytest.mark.requires_postgres


@pytest.fixture
def conn(db_session):
    c = db_session.connection()
    c.execute(text("create temp table rw_links (id serial primary key, url varchar(200))"))
    c.execute(text("create temp table rw_short (id serial primary key, url varchar(60))"))
    c.execute(text("create temp table rw_docs (id serial primary key, meta jsonb)"))
    return c


def _rows(conn, table, col):
    return [r[0] for r in conn.execute(text(f"select {col} from {table} order by id"))]


@pg
def test_moves_only_leading_old_links(conn):
    vals = [
        f"{OLD}/photos/a.jpg",
        f"{NEW}/photos/b.jpg",                      # already moved
        f"https://evil.example/{OLD}/photos/c.jpg",  # old address NOT leading
        f"{OLD}.evil.com/photos/d.jpg",             # look-alike host
        "https://upload.wikimedia.org/x.jpg",
        None,
    ]
    for v in vals:
        conn.execute(text("insert into rw_links (url) values (:v)"), {"v": v})

    assert rw.move(conn, [OLD], NEW, apply=False, link_columns=[("rw_links", "url")], json_columns=[]) == {"rw_links.url": 1}
    assert _rows(conn, "rw_links", "url") == vals  # dry run wrote nothing

    assert rw.move(conn, [OLD], NEW, apply=True, link_columns=[("rw_links", "url")], json_columns=[]) == {"rw_links.url": 1}
    assert _rows(conn, "rw_links", "url") == [f"{NEW}/photos/a.jpg", *vals[1:]]

    # Re-running finds nothing.
    assert rw.move(conn, [OLD], NEW, apply=True, link_columns=[("rw_links", "url")], json_columns=[]) == {}


@pg
def test_json_documents_have_the_address_replaced_everywhere(conn):
    conn.execute(text("insert into rw_docs (meta) values (cast(:m as jsonb))"), {
        "m": f'{{"thumbnail": "{OLD}/thumbnails/thumb_1.jpg", "photos": ["{OLD}/photos/2.jpg"], "name": "Rosie"}}',
    })
    conn.execute(text("""insert into rw_docs (meta) values ('{"name": "no photo"}'::jsonb)"""))
    assert rw.move(conn, [OLD], NEW, apply=True, link_columns=[], json_columns=[("rw_docs", "meta")]) == {"rw_docs.meta": 1}
    doc = _rows(conn, "rw_docs", "meta")[0]
    assert doc == {"thumbnail": f"{NEW}/thumbnails/thumb_1.jpg", "photos": [f"{NEW}/photos/2.jpg"], "name": "Rosie"}


@pg
def test_a_link_that_would_not_fit_stops_the_run(conn):
    short_old = "https://a.r2.dev"
    long_new = "https://a-much-longer-photo-address.example.com"
    conn.execute(text("insert into rw_short (url) values (:v)"), {"v": f"{short_old}/photos/{'x' * 30}.jpg"})
    with pytest.raises(RuntimeError, match="holds 60"):
        rw.move(conn, [short_old], long_new, apply=True, link_columns=[("rw_short", "url")], json_columns=[])


@pg
def test_real_tables_and_the_leftover_scan(conn, test_user, db_session):
    user, _ = test_user
    key = f"avatars/avatar_{uuid.uuid4()}.jpg"
    user.avatar_url = f"{OLD}/{key}"
    db_session.flush()

    assert ("users", "avatar_url", 1) in rw.leftovers(conn, OLD)
    report = rw.move(conn, [OLD], NEW, apply=True)
    assert report.get("users.avatar_url", 0) >= 1
    db_session.expire_all()
    assert user.avatar_url == f"{NEW}/{key}"
    assert all(t != "users" for t, _c, _n in rw.leftovers(conn, OLD))

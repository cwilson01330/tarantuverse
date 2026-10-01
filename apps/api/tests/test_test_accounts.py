"""Google Play's pre-launch robots must never count as signups."""
from sqlalchemy import create_engine, select, func
from sqlalchemy.dialects import postgresql

from app.models.user import User
from app.utils.test_accounts import (
    TEST_ACCOUNT_DOMAINS,
    is_test_account,
    real_user_clause,
    test_user_clause,
)


def test_is_test_account_matches_domain_case_insensitively():
    assert is_test_account("robot.123@cloudtestlabaccounts.com")
    assert is_test_account("Robot@CloudTestLabAccounts.COM")


def test_is_test_account_ignores_real_and_lookalike_addresses():
    assert not is_test_account("keeper@gmail.com")
    assert not is_test_account("cloudtestlabaccounts.com@gmail.com")
    assert not is_test_account("me@notcloudtestlabaccounts.com")
    assert not is_test_account(None)
    assert not is_test_account("")


def _sql(clause) -> str:
    return str(
        select(func.count(User.id)).where(clause).compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )


def test_real_user_clause_excludes_every_test_domain():
    sql = _sql(real_user_clause())
    for d in TEST_ACCOUNT_DOMAINS:
        assert f"@{d}'" in sql  # compiled as '%%@domain' (psycopg escaping)
    assert "NOT LIKE" in sql and "lower(" in sql


def test_real_and_test_clauses_partition_users_in_sqlite():
    # SQLite understands lower()/LIKE, so run the real clause end to end.
    eng = create_engine("sqlite://")
    with eng.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE u (email TEXT)")
        conn.exec_driver_sql(
            "INSERT INTO u VALUES ('a@gmail.com'), ('b@CloudTestLabAccounts.com'),"
            " ('c@cloudtestlabaccounts.com'), ('d@notcloudtestlabaccounts.com')"
        )
        from sqlalchemy import column, table

        t = table("u", column("email"))
        real = conn.execute(select(func.count()).select_from(t).where(real_user_clause(t.c.email))).scalar()
        test = conn.execute(select(func.count()).select_from(t).where(test_user_clause(t.c.email))).scalar()
    assert real == 2  # gmail + the lookalike domain
    assert test == 2


def test_counting_routes_use_the_clause():
    """Every place that counts users for admin or lists keepers publicly."""
    import inspect
    from app.routers import admin, admin_analytics, discover, keepers, search

    for mod in (admin, admin_analytics, discover, keepers, search):
        assert "real_user_clause" in inspect.getsource(mod), mod.__name__
    # No bare user count left in the admin analytics module.
    src = inspect.getsource(admin_analytics)
    assert "db.query(func.count(User.id)).scalar()" not in src

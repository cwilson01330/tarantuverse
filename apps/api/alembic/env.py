from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

# Import your models' Base and settings
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.database import Base
from app.config import settings

# Import all your models here so Alembic can detect them
from app.models.user import User
from app.models.species import Species
from app.models.tarantula import Tarantula
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.photo import Photo

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Set the sqlalchemy.url from your settings
config.set_main_option('sqlalchemy.url', settings.DATABASE_URL)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def _ensure_alembic_version_length(connection) -> None:
    """Widen alembic_version.version_num to fit our long revision IDs.

    Alembic's default column is VARCHAR(32), but several of our revision
    IDs exceed that — e.g. ``flg_20260421_extend_feeding_logs_polymorphic``
    is 44 chars. On 2026-04-22 this caused a prod deploy to fail mid-chain
    with ``StringDataRightTruncation`` when Alembic tried to record the
    ``anc_20260421_add_announcement_settings`` revision.

    Idempotent:
      - If ``alembic_version`` doesn't exist yet (fresh DB), do nothing —
        Alembic will create it with whatever default and the next run will
        widen it.
      - If the column is already wide enough, do nothing.
      - Otherwise, ALTER COLUMN to VARCHAR(255).
    """
    from sqlalchemy import text

    current_length = connection.execute(text(
        "SELECT character_maximum_length "
        "FROM information_schema.columns "
        "WHERE table_name = 'alembic_version' "
        "  AND column_name = 'version_num'"
    )).scalar()

    if current_length is not None and current_length < 255:
        connection.execute(text(
            "ALTER TABLE alembic_version "
            "ALTER COLUMN version_num TYPE VARCHAR(255)"
        ))


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Ensure the version column can hold our revision IDs *before*
        # Alembic tries to UPDATE it. Runs in its own transaction so the
        # DDL commits regardless of what the migration chain does next.
        with connection.begin():
            _ensure_alembic_version_length(connection)

        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
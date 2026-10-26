"""
Database connection and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

def engine_echo(debug: bool, environment: str) -> bool:
    """Whether to log SQL statements. Echo logs every bound value (emails,
    notes, message text), so it is only ever allowed in local development —
    never in production, whatever DEBUG says."""
    return bool(debug) and environment == "development"


# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=engine_echo(settings.DEBUG, settings.ENVIRONMENT),
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency to get database session

    Usage in routes:
        db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

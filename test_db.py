#!/usr/bin/env python3
"""Test database connection to Neon"""
import sys
import os

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'apps/api'))

try:
    from sqlalchemy import create_engine, text

    DATABASE_URL = "postgresql://neondb_owner:npg_dgvxbC3M4zOc@ep-wandering-block-ad2szvfc-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"

    print(f"Connecting to Neon database...")
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        result = conn.execute(text("SELECT version();"))
        version = result.fetchone()[0]
        print(f"✅ Connected successfully!")
        print(f"PostgreSQL version: {version}")

        # Check if tables exist
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        """))
        tables = [row[0] for row in result.fetchall()]

        if tables:
            print(f"\n📋 Existing tables: {', '.join(tables)}")
        else:
            print(f"\n⚠️  No tables found. Run 'alembic upgrade head' to create them.")

except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)

#!/usr/bin/env python3
"""Check the enclosuretype enum"""
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://neondb_owner:npg_dgvxbC3M4zOc@ep-wandering-block-ad2szvfc-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT enumlabel FROM pg_enum "
        "JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
        "WHERE pg_type.typname = 'enclosuretype'"
    ))
    values = [row[0] for row in result]
    print('EnclosureType enum values:')
    for val in values:
        print(f'  - {val}')

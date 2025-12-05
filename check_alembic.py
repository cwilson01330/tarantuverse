from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv("apps/api/.env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not found")
    exit(1)

engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM alembic_version"))
        rows = result.fetchall()
        print("Alembic Version(s):")
        for row in rows:
            print(row)
except Exception as e:
    print(f"Error: {e}")

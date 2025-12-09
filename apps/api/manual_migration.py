from app.database import engine
from sqlalchemy import text, inspect

def run_migration():
    try:
        with engine.connect() as conn:
            inspector = inspect(engine)
            # Must check if table exists first, assuming 'users' exists
            columns = [c['name'] for c in inspector.get_columns('users')]
            
            print(f"Existing columns: {columns}")
            
            # Add columns if missing
            if 'reset_token' not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)"))
                print("Added reset_token")
                
            if 'reset_token_expires_at' not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP WITH TIME ZONE"))
                print("Added reset_token_expires_at")
                
            if 'is_verified' not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE"))
                # Set existing users to verified
                conn.execute(text("UPDATE users SET is_verified = TRUE"))
                print("Added is_verified")
            
            # Note: Previously added columns might have default False if added via this script, 
            # but we force update immediately.
            
            if 'verification_token' not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR(255)"))
                print("Added verification_token")
                
            if 'verification_token_expires_at' not in columns:
                 conn.execute(text("ALTER TABLE users ADD COLUMN verification_token_expires_at TIMESTAMP WITH TIME ZONE"))
                 print("Added verification_token_expires_at")
                 
            # Commit changes
            conn.commit()
            
            # Update Alembic Version
            conn.execute(text("DELETE FROM alembic_version"))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('o6p7q8r9s0t1')"))
            conn.commit()
            print("Stamped alembic version to o6p7q8r9s0t1")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    run_migration()

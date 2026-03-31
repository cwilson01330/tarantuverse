"""
Quick database connection test
Run with: python test_db_connection.py
"""
import os
import time
from sqlalchemy import create_engine, text

def test_connection():
    """Test database connection with detailed diagnostics"""
    
    # Get DATABASE_URL
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("❌ DATABASE_URL environment variable not set!")
        print("\nMake sure you're running this in the Render shell where environment variables are set.")
        return
    
    # Mask password in output
    masked_url = database_url
    if "@" in database_url:
        parts = database_url.split("@")
        if ":" in parts[0]:
            user_pass = parts[0].split("://")[1]
            user = user_pass.split(":")[0]
            masked_url = database_url.replace(user_pass, f"{user}:****")
    
    print("🔌 Testing database connection...")
    print(f"📍 URL: {masked_url}\n")
    
    # Try connection with retries
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"⏳ Connection attempt {attempt + 1}/{max_retries}...")
            
            engine = create_engine(
                database_url,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 10}
            )
            
            with engine.connect() as conn:
                result = conn.execute(text("SELECT version()"))
                version = result.fetchone()[0]
                
                print("✅ Connection successful!")
                print(f"📊 PostgreSQL version: {version[:50]}...")
                
                # Test species table
                result = conn.execute(text("SELECT COUNT(*) FROM species"))
                count = result.fetchone()[0]
                print(f"🕷️  Species in database: {count}")
                
                return True
                
        except Exception as e:
            error_msg = str(e)
            
            if "Control plane request failed" in error_msg:
                print(f"❌ Attempt {attempt + 1} failed: Neon control plane error")
                print("   This usually means the database needs to be woken up.")
                
            elif "Connection refused" in error_msg:
                print(f"❌ Attempt {attempt + 1} failed: Connection refused")
                print("   The database server is not responding.")
                
            elif "timeout" in error_msg.lower():
                print(f"❌ Attempt {attempt + 1} failed: Connection timeout")
                print("   The database is taking too long to respond.")
                
            else:
                print(f"❌ Attempt {attempt + 1} failed: {error_msg[:100]}")
            
            if attempt < max_retries - 1:
                print(f"   ⏳ Waiting 10 seconds before retry...\n")
                time.sleep(10)
    
    print("\n❌ All connection attempts failed!")
    print("\n🔧 Troubleshooting steps:")
    print("1. Go to https://console.neon.tech")
    print("2. Select your 'tarantuverse' project")
    print("3. Check if the project status shows 'Suspended' or 'Idle'")
    print("4. Click the 'Wake up' or 'Resume' button")
    print("5. Wait 30 seconds for the database to fully start")
    print("6. Run this script again")
    print("\n💡 Tip: Neon free tier auto-suspends after 5 minutes of inactivity")
    
    return False

if __name__ == "__main__":
    test_connection()

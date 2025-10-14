from app.database import SessionLocal
from app.models.species import Species
import uuid
import time
import sys

def seed():
    print('Connecting to database...')
    max_retries = 3
    retry_delay = 10
    
    for attempt in range(max_retries):
        try:
            db = SessionLocal()
            count = db.query(Species).count()
            print(f'Connected! Current species: {count}')
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f'Connection attempt {attempt + 1} failed')
                time.sleep(retry_delay)
            else:
                print('Failed to connect')
                sys.exit(1)
    
    try:
        if count > 0:
            print(f'Found {count} species. Type add to add more or skip:')
            response = input()
            if response.lower() != 'add':
                return
        
        species_data = []
        
        for data in species_data:
            existing = db.query(Species).filter(Species.scientific_name == data['scientific_name']).first()
            if existing:
                continue
            
            species = Species(
                id=uuid.uuid4(),
                scientific_name_lower=data['scientific_name'].lower(),
                **data
            )
            db.add(species)
        
        db.commit()
        print('Done!')
        
    except Exception as e:
        print(f'Error: {e}')
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    seed()

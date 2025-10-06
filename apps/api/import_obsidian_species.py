"""
Import species data from Obsidian vault
Run with: python3 import_obsidian_species.py
"""
import os
import re
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.species import Species, CareLevel

# Path to Obsidian vault
VAULT_PATH = r"C:\Users\gwiza\Documents\Obscuravault"


def parse_species_file(filepath):
    """Parse an Obsidian markdown file for species data"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    data = {}

    # Extract title (species name)
    title_match = re.search(r'^#\s+(.+?)(?:\s*-|\s*\(|$)', content, re.MULTILINE)
    if title_match:
        title = title_match.group(1).strip()
        # Try to extract scientific name
        sci_match = re.search(r'([A-Z][a-z]+\s+[a-z]+)', title)
        if sci_match:
            data['scientific_name'] = sci_match.group(1)

    # Extract common names
    common_match = re.search(r'\*\*Common Name[s]?:\*\*\s*(.+)', content)
    if common_match:
        common_names = common_match.group(1).strip()
        data['common_names'] = [n.strip() for n in re.split(r'[,/]', common_names)]

    # Extract technical details block
    tech_match = re.search(r'```\n(.*?)\n```', content, re.DOTALL)
    if tech_match:
        tech_block = tech_match.group(1)

        # Temperature
        temp_match = re.search(r'Temperature:\s*(\d+)-(\d+)', tech_block)
        if temp_match:
            data['temperature_min'] = int(temp_match.group(1))
            data['temperature_max'] = int(temp_match.group(2))

        # Humidity
        hum_match = re.search(r'Humidity:\s*(\d+)-?(\d+)?', tech_block)
        if hum_match:
            data['humidity_min'] = int(hum_match.group(1))
            if hum_match.group(2):
                data['humidity_max'] = int(hum_match.group(2))

        # Size
        size_match = re.search(r'(?:Size|Adult Size):\s*(?:Up to\s+)?(.+?)(?:\n|DLS)', tech_block)
        if size_match:
            data['adult_size'] = size_match.group(1).strip()

        # Enclosure
        enc_match = re.search(r'Enclosure:\s*(.+)', tech_block)
        if enc_match:
            data['enclosure_size_adult'] = enc_match.group(1).strip()

        # Substrate
        sub_match = re.search(r'Substrate:\s*(.+?)(?:\n|$)', tech_block)
        if sub_match:
            substrate = sub_match.group(1).strip()
            depth_match = re.search(r'(\d+-?\d*\s*(?:inches?|"))', substrate)
            if depth_match:
                data['substrate_depth'] = depth_match.group(1)
            data['substrate_type'] = substrate

        # Experience level
        exp_match = re.search(r'Experience:\s*(.+)', tech_block)
        if exp_match:
            exp = exp_match.group(1).lower()
            if 'beginner' in exp:
                data['care_level'] = CareLevel.BEGINNER
            elif 'intermediate' in exp:
                data['care_level'] = CareLevel.INTERMEDIATE
            else:
                data['care_level'] = CareLevel.ADVANCED

    # Type (terrestrial/arboreal/fossorial)
    if 'arboreal' in content.lower():
        data['type'] = 'arboreal'
    elif 'fossorial' in content.lower():
        data['type'] = 'fossorial'
    elif 'terrestrial' in content.lower():
        data['type'] = 'terrestrial'

    # Temperament
    temp_match = re.search(r'(?:Temperament|temperament):\s*(.+)', content)
    if temp_match:
        data['temperament'] = temp_match.group(1).strip().split('\n')[0]

    # Native region
    native_match = re.search(r'(?:Native|native_region|Native Region):\s*(.+)', content)
    if native_match:
        data['native_region'] = native_match.group(1).strip().split('\n')[0]

    # Growth rate
    growth_match = re.search(r'(?:Growth Rate|growth_rate):\s*(.+)', content)
    if growth_match:
        data['growth_rate'] = growth_match.group(1).strip().split('\n')[0].lower()

    # Feeding schedule
    feed_adult = re.search(r'(?:Adults?|Adult).*?(?:Every|every)\s+(.+?)(?:\n|days|,)', content)
    if feed_adult:
        data['feeding_frequency_adult'] = f"Every {feed_adult.group(1).strip()}"

    feed_sling = re.search(r'(?:Spiderlings?|Sling).*?(?:Every|every)\s+(.+?)(?:\n|days|,)', content)
    if feed_sling:
        data['feeding_frequency_sling'] = f"Every {feed_sling.group(1).strip()}"

    # Burrowing
    if 'burrow' in content.lower():
        data['burrowing'] = True

    # Webbing
    if 'heavy web' in content.lower() or 'extensive web' in content.lower():
        data['webbing_amount'] = 'heavy'
    elif 'moderate web' in content.lower():
        data['webbing_amount'] = 'moderate'
    elif 'light web' in content.lower():
        data['webbing_amount'] = 'light'

    # Care guide (extract summary and key insights)
    summary_match = re.search(r'## Summary\n\*(.+?)\*\n\n(.+?)(?:\n##|$)', content, re.DOTALL)
    if summary_match:
        data['care_guide'] = f"{summary_match.group(1).strip()}\n\n{summary_match.group(2).strip()}"

    return data


def import_species():
    """Import all species from Obsidian vault"""
    db = SessionLocal()

    try:
        print("Scanning Obsidian vault for species files...")

        # Find all species husbandry files
        species_files = []
        for filename in os.listdir(VAULT_PATH):
            if filename.endswith('.md') and ('husbandry' in filename.lower() or 'care' in filename.lower()):
                # Skip generic guides
                if 'guide' in filename.lower() and 'species' not in filename.lower():
                    if any(word in filename.lower() for word in ['introduction', 'wiki', 'developments', 'comparisons']):
                        continue
                species_files.append(os.path.join(VAULT_PATH, filename))

        print(f"Found {len(species_files)} species files\n")

        imported = 0
        skipped = 0

        for filepath in species_files:
            filename = os.path.basename(filepath)
            print(f"Processing: {filename}")

            try:
                data = parse_species_file(filepath)

                if not data.get('scientific_name'):
                    print(f"  ⚠️  Skipping (no scientific name found)\n")
                    skipped += 1
                    continue

                # Check if already exists
                existing = db.query(Species).filter(
                    Species.scientific_name_lower == data['scientific_name'].lower().strip()
                ).first()

                if existing:
                    print(f"  ⏭️  Skipping (already exists: {data['scientific_name']})\n")
                    skipped += 1
                    continue

                # Create species
                species = Species(
                    **data,
                    scientific_name_lower=data['scientific_name'].lower().strip(),
                    is_verified=True,
                    source_url=f"Obsidian: {filename}"
                )

                db.add(species)
                db.commit()

                print(f"  ✅ Imported: {data['scientific_name']}")
                if data.get('common_names'):
                    print(f"     Common: {', '.join(data['common_names'])}")
                print()

                imported += 1

            except Exception as e:
                print(f"  ❌ Error: {e}\n")
                db.rollback()
                continue

        print(f"\n{'='*60}")
        print(f"🎉 Import complete!")
        print(f"   Imported: {imported}")
        print(f"   Skipped:  {skipped}")
        print(f"{'='*60}")

    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    import_species()

"""
Fill `typical_instars_to_maturity` ("molts to adult") on the care sheets that
have a sourced figure (2026-10-07). The Stages card on instar animals then says
"Usually adult after about 7 molts (around L8)".

What the number means: MOLTS from hatching (mantids, roaches) or birth
(scorpions, vinegaroons) to adult. Keepers number the hatchling L1 / instar 1,
so the adult stage is one higher. When the sexes differ (male mantids usually
mature one molt sooner) this is the larger, female figure; the app says
"males often one sooner" for mantids.

Honesty rule, same as every seed: a value is here only when a source we read
states it. Single-keeper anecdotes, unsourced forum figures, conflicting n=1
studies and subspecies-only figures were left out (Hierodula patellifera,
Hottentotta hottentotta, Leiurus quinquestriatus, Tityus stigmurus,
Smeringurus mesaensis, Heterometrus spp.). Whip spiders are deliberately
absent: amblypygids keep molting as adults, so "molts to adult" isn't a
finish line for them.

Only EMPTY values are filled. Anything an admin already set is left alone and
reported. Also sets stage_scheme='instar' on the three mantis/scorpion sheets
that had none (every other sheet in those taxa already says 'instar').

Run (Render shell, from apps/api):
    python3 update_molts_to_adult_20261007.py --dry-run
    python3 update_molts_to_adult_20261007.py
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# scientific_name -> (molts to adult, source)
MOLTS_TO_ADULT: dict[str, tuple[int, str]] = {
    # ── Mantids (female figure; males usually one fewer) ────────────────────
    "Phyllocrania paradoxa": (7, "https://www.keepinginsects.com/praying-mantis/species/phyllocrania-paradoxa/"),  # "L1 = hatchling; adults at L7 (M) / L8 (F)"
    "Tenodera sinensis": (7, "https://mantidkingdom.com/mantid-care/tenodera-sinensis/"),
    "Deroplatys desiccata": (8, "https://mantidkingdom.com/mantid-care/deroplatys-desiccata/"),
    "Deroplatys lobata": (8, "https://mantidforum.net/threads/number-of-molts-d-lobata-goes-through.4900"),
    "Hierodula membranacea": (7, "https://mantidkingdom.com/mantid-care/hierodula-membranacea/"),
    "Hymenopus coronatus": (7, "https://mantidkingdom.com/mantid-care/hymenopus-coronatus/"),  # sources split 7/8 for females
    "Mantis religiosa": (6, "https://www.entomoljournal.com/archives/2016/vol4issue6/PartG/4-5-177-186.pdf"),
    "Pseudocreobotra wahlbergii": (7, "https://mantidkingdom.com/mantid-care/psuedocreobotra-wahlbergii/"),
    "Stagmomantis carolina": (6, "https://mantidforum.net/threads/how-many-molts-for-carolina.16862"),
    "Idolomantis diabolica": (8, "https://en.wikipedia.org/wiki/Idolomantis"),
    "Gongylus gongylodes": (7, "https://mantidkingdom.com/mantid-care/gongylus-gongylodes/"),
    "Sphodromantis lineola": (7, "https://mantidkingdom.com/mantid-care/sphodromantis-sp/"),
    "Creobroter gemmatus": (7, "https://mantidforum.net/posts/244145/"),
    "Blepharopsis mendica": (7, "https://peerj.com/articles/16814.pdf"),
    "Popa spurca": (8, "https://mantidforum.net/goto/post?id=337032"),
    "Miomantis paykullii": (7, "https://journals.ekb.eg/article_84411.html"),
    "Acanthops falcata": (7, "https://en.wikipedia.org/wiki/Acanthops_falcata"),
    # ── Scorpions (newborn on the mother's back = instar 1) ─────────────────
    "Pandinus imperator": (6, "https://www.oocities.org/gyprice2000/EmperorScorpionReproductionPage.htm"),  # modal; range 6-7
    "Androctonus australis": (7, "https://www.americanarachnology.org/journal-joa/joa-all-articles/"),  # Francke & Jones 1982, citing Auber-Thomay 1974
    "Lychas mucronatus": (6, "https://arachnoboards.com/threads/lychas-mucronatus-communal.212895"),  # females 6, males 5
    "Centruroides gracilis": (6, "https://www.americanarachnology.org/journal-joa/joa-all-articles/"),  # Francke & Jones 1982
    "Tityus serrulatus": (5, "https://britishspiders.org.uk/system/files/library/030906.pdf"),
    "Euscorpius flavicaudis": (5, "https://archive.org/download/biostor-216819/biostor-216819.pdf"),  # modal; some 6
    "Isometrus maculatus": (6, "https://britishspiders.org.uk/system/files/library/030906.pdf"),
    # ── Others ──────────────────────────────────────────────────────────────
    "Mastigoproctus giganteus": (4, "https://animaldiversity.org/accounts/Mastigoproctus_giganteus"),
    "Gromphadorhina portentosa": (6, "https://animaldiversity.org/accounts/Gromphadorhina_portentosa"),
}

# Sheets in instar taxa with no stage_scheme set.
STAGE_SCHEME_INSTAR = ["Rhombodera kirbyi", "Androctonus bicolor", "Centruroides margaritatus"]


def _check():
    for name, (n, _src) in MOLTS_TO_ADULT.items():
        if not 1 <= n <= 40:  # invert_species_instars_range_check
            raise SystemExit(f"{name}: {n} is outside the column's 1-40 range")


def run(dry_run: bool) -> None:
    from app.database import SessionLocal
    from app.models.invert_species import InvertSpecies

    _check()
    db = SessionLocal()
    filled = kept = missing = 0
    try:
        for name, (n, _src) in MOLTS_TO_ADULT.items():
            sp = db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first()
            if sp is None:
                missing += 1
                print(f"  not in catalog: {name}")
                continue
            if sp.typical_instars_to_maturity is not None:
                kept += 1
                if sp.typical_instars_to_maturity != n:
                    print(f"  left alone: {name} already {sp.typical_instars_to_maturity} (research says {n})")
                continue
            filled += 1
            print(f"  {name}: {n} molts to adult")
            if not dry_run:
                sp.typical_instars_to_maturity = n
                if sp.stage_scheme is None:
                    sp.stage_scheme = "instar"
        for name in STAGE_SCHEME_INSTAR:
            sp = db.query(InvertSpecies).filter(InvertSpecies.scientific_name_lower == name.lower()).first()
            if sp is not None and sp.stage_scheme is None:
                print(f"  {name}: stage_scheme -> instar")
                if not dry_run:
                    sp.stage_scheme = "instar"
        if dry_run:
            db.rollback()
        else:
            db.commit()
    finally:
        db.close()
    verb = "Would fill" if dry_run else "Filled"
    print(f"{verb} {filled}; already set {kept}; not in catalog {missing}.")


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)

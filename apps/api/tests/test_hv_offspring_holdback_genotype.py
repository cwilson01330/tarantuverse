"""Audit-2 H2 (2026-10-08): holding a hatchling back carries its genes.

Holding an offspring back links it to a new animal (PUT
/reptile-offspring/{id} with `animal_id`). The offspring's genotype editor
is then disabled because the live record's genotype is authoritative — so
unless the hold-back copies `recorded_genotype` onto the animal, the genes
noted at hatch are orphaned. Server-side, so both HV clients get it.

Fake-DB style, like test_hv_audit2_animals.
"""
from __future__ import annotations

import asyncio
import inspect
import uuid
from types import SimpleNamespace as NS

import pytest

from app.models.animal import Animal
from app.models.animal_genotype import AnimalGenotype
from app.models.clutch import Clutch
from app.models.gene import Gene
from app.models.reptile_offspring import ReptileOffspring
from app.routers import reptile_offspring as ro
from app.schemas.reptile_breeding import ReptileOffspringCreate, ReptileOffspringUpdate


class Q:
    def __init__(self, first=None, all_=None, count=0):
        self._first, self._all, self._count = first, list(all_ or []), count

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._all)

    def count(self):
        return self._count


class DB:
    def __init__(self, by_model):
        self.by_model = by_model
        self.added, self.commits = [], 0

    def query(self, model, *_):
        return self.by_model.get(model, Q())

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        pass

    def genotypes(self):
        return [o for o in self.added if isinstance(o, AnimalGenotype)]


def run(fn, **kw):
    return asyncio.run(inspect.unwrap(fn)(**kw))


def gene(name, gene_type, species="Python regius"):
    return NS(id=uuid.uuid4(), common_name=name, gene_type=gene_type,
              species_scientific_name=species)


CATALOG = [
    gene("Clown", "recessive"),
    gene("Piebald", "recessive"),
    gene("Pastel", "incomplete_dominant"),
    gene("Pinstripe", "dominant"),
    # Same name, other species — must not be picked for a ball python.
    gene("Pastel", "codominant", species="Morelia spilota"),
]


@pytest.fixture
def owner():
    return NS(id=uuid.uuid4(), is_active=True, is_premium_for_app=lambda app: True)


def _setup(owner, recorded, existing_rows=0, linked_already=None, scientific_name="Python regius"):
    a = NS(id=uuid.uuid4(), user_id=owner.id, scientific_name=scientific_name)
    o = NS(id=uuid.uuid4(), user_id=owner.id, clutch_id=uuid.uuid4(),
           animal_id=linked_already, recorded_genotype=recorded, status="hatched")
    db = DB({
        ReptileOffspring: Q(first=o),
        Animal: Q(first=a),
        AnimalGenotype: Q(count=existing_rows),
        Gene: Q(all_=CATALOG),
    })
    return a, o, db


def _by_gene(db):
    names = {g.id: g.common_name for g in CATALOG}
    return {names[r.gene_id]: r.zygosity for r in db.genotypes()}


def test_holdback_copies_recorded_genotype_with_vocabulary_mapping(owner):
    recorded = [
        {"gene_key": "clown", "zygosity": "hom"},       # recessive, 2 copies → visual
        {"gene_key": "Piebald", "zygosity": "het"},     # recessive, 1 copy → het
        {"gene_key": "PASTEL", "zygosity": "hom"},      # inc-dom, 2 copies → super
        {"gene_key": "Pinstripe", "zygosity": "het"},   # dominant, 1 copy → visual
        {"gene_key": "Albino", "zygosity": "het"},      # not catalogued → skipped
        {"gene_key": "Clown", "zygosity": "wild"},      # duplicate name; first wins
    ]
    a, o, db = _setup(owner, recorded)
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(animal_id=a.id, status="kept"),
        db=db, current_user=owner)

    assert o.animal_id == a.id
    assert _by_gene(db) == {
        "Clown": "visual", "Piebald": "het", "Pastel": "super", "Pinstripe": "visual",
    }
    # The ball-python Pastel, not the carpet-python one.
    assert CATALOG[2].id in {r.gene_id for r in db.genotypes()}
    assert CATALOG[4].id not in {r.gene_id for r in db.genotypes()}
    assert all(r.animal_id == a.id for r in db.genotypes())
    assert db.commits == 1


def test_wild_entries_record_nothing(owner):
    a, o, db = _setup(owner, [{"gene_key": "Clown", "zygosity": "wild"}])
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(animal_id=a.id), db=db, current_user=owner)
    assert db.genotypes() == []


def test_animal_with_its_own_genes_is_never_overwritten(owner):
    a, o, db = _setup(owner, [{"gene_key": "Clown", "zygosity": "het"}], existing_rows=2)
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(animal_id=a.id), db=db, current_user=owner)
    assert db.genotypes() == []


def test_resending_the_same_link_does_not_copy_again(owner):
    a, o, db = _setup(owner, [{"gene_key": "Clown", "zygosity": "het"}])
    o.animal_id = a.id  # already held back
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(animal_id=a.id, notes="sold the sibling"),
        db=db, current_user=owner)
    assert db.genotypes() == []


def test_edit_without_link_copies_nothing(owner):
    a, o, db = _setup(owner, [{"gene_key": "Clown", "zygosity": "het"}])
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(notes="eating well"), db=db, current_user=owner)
    assert db.genotypes() == []


def test_genotype_sent_with_the_link_is_the_one_copied(owner):
    a, o, db = _setup(owner, None)
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(
            animal_id=a.id,
            recorded_genotype=[{"gene_key": "Piebald", "zygosity": "hom"}],
        ),
        db=db, current_user=owner)
    assert _by_gene(db) == {"Piebald": "visual"}


def test_no_species_only_unambiguous_names_match(owner):
    # "Pastel" exists in two catalogs → ambiguous without a species; "Clown"
    # exists in one → safe.
    a, o, db = _setup(
        owner,
        [{"gene_key": "Pastel", "zygosity": "het"}, {"gene_key": "Clown", "zygosity": "het"}],
        scientific_name=None,
    )
    run(ro.update_offspring, offspring_id=o.id,
        payload=ReptileOffspringUpdate(animal_id=a.id), db=db, current_user=owner)
    assert _by_gene(db) == {"Clown": "het"}


def test_create_with_link_copies_too(owner):
    a, _o, db = _setup(owner, None)
    db.by_model[Clutch] = Q(first=NS(id=uuid.uuid4(), user_id=owner.id))
    run(ro.create_offspring,
        payload=ReptileOffspringCreate(
            clutch_id=uuid.uuid4(), animal_id=a.id, status="kept",
            recorded_genotype=[{"gene_key": "Clown", "zygosity": "het"}],
        ),
        db=db, current_user=owner)
    assert _by_gene(db) == {"Clown": "het"}


@pytest.mark.parametrize("gene_type,zyg,expected", [
    ("recessive", "het", "het"),
    ("recessive", "hom", "visual"),
    ("dominant", "het", "visual"),
    ("dominant", "hom", "visual"),
    ("codominant", "het", "visual"),
    ("codominant", "hom", "super"),
    ("incomplete_dominant", "het", "visual"),
    ("incomplete_dominant", "hom", "super"),
    ("recessive", "wild", None),
])
def test_zygosity_mapping(gene_type, zyg, expected):
    assert ro._animal_zygosity(gene_type, zyg) == expected

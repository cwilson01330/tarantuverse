"""Clutch "Predicted outcomes" reads the parents' stored genotypes (2026-10-08).

`animal_genotypes` stores the hobby vocabulary (het / visual / poss_het /
super), but `_genotype_rows_to_entries` only accepted wild / het / hom, so
every visual, super and poss-het gene was dropped and the panel said "no
genotype" for most animals. The mapping now follows the morph calculator's
own model (lib/genes.ts stateToCount), by inheritance mode.
"""
import asyncio
import inspect
import uuid
from types import SimpleNamespace as NS

import pytest

from app.models.animal import Animal
from app.models.animal_genotype import AnimalGenotype
from app.models.clutch import Clutch
from app.models.reptile_pairing import ReptilePairing
from app.routers import clutches as cl


def _rows(*triples):
    """(stored zygosity, gene_type, gene name) -> (genotype, gene) rows."""
    return [
        (NS(zygosity=z), NS(common_name=name, gene_type=t))
        for z, t, name in triples
    ]


def _mapped(z, t):
    out = cl._genotype_rows_to_entries(_rows((z, t, "G")))
    return out[0].zygosity if out else None


@pytest.mark.parametrize("gene_type", ["recessive", "dominant", "codominant", "incomplete_dominant"])
def test_het_is_one_copy_for_every_mode(gene_type):
    assert _mapped("het", gene_type) == "het"


def test_visual_recessive_is_homozygous():
    """A recessive only shows with two copies."""
    assert _mapped("visual", "recessive") == "hom"


@pytest.mark.parametrize("gene_type", ["codominant", "incomplete_dominant"])
def test_visual_co_and_incomplete_dominant_is_one_copy(gene_type):
    """One copy shows; two is the super."""
    assert _mapped("visual", gene_type) == "het"


def test_visual_dominant_is_one_copy():
    """The picker can't tell one copy from two for a dominant, so the stored
    'visual' is read as the usual (and conservative) single copy."""
    assert _mapped("visual", "dominant") == "het"


@pytest.mark.parametrize("gene_type", ["codominant", "incomplete_dominant"])
def test_super_is_homozygous(gene_type):
    assert _mapped("super", gene_type) == "hom"


def test_poss_het_is_left_out_not_guessed():
    """A possible het is a probability. Calling it het overstates the odds,
    calling it wild understates them — so it isn't sent as a genotype."""
    assert _mapped("poss_het", "recessive") is None


def test_visual_with_unknown_inheritance_is_not_guessed():
    assert _mapped("visual", "mystery") is None
    assert _mapped("visual", None) is None


def test_legacy_predictor_vocabulary_still_reads():
    assert _mapped("wild", "recessive") == "wild"
    assert _mapped("hom", "recessive") == "hom"


def test_malformed_and_nameless_rows_are_skipped():
    rows = _rows(("bogus", "recessive", "A"), ("visual", "recessive", None), ("visual", "recessive", "Pied"))
    out = cl._genotype_rows_to_entries(rows)
    assert [(e.gene_key, e.zygosity) for e in out] == [("Pied", "hom")]


def test_a_typical_ball_python_genotype_is_fully_represented():
    """Before the fix only the het survived — 'no genotype' for most animals."""
    rows = _rows(
        ("visual", "recessive", "Clown"),
        ("het", "recessive", "Pied"),
        ("visual", "incomplete_dominant", "Pastel"),
        ("super", "incomplete_dominant", "Mojave"),
        ("visual", "dominant", "Pinstripe"),
        ("poss_het", "recessive", "Albino"),
    )
    got = {e.gene_key: e.zygosity for e in cl._genotype_rows_to_entries(rows)}
    assert got == {
        "Clown": "hom", "Pied": "het", "Pastel": "het",
        "Mojave": "hom", "Pinstripe": "het",
    }


# ── the route's note mentions left-out poss-hets ────────────────────────────

class Q:
    def __init__(self, first=None, all_=None):
        self._first, self._all = first, list(all_ or [])

    def join(self, *a, **k):
        return self

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._first

    def all(self):
        return list(self._all)


class DB:
    def __init__(self, by_model):
        self.by_model = by_model

    def query(self, model, *_):
        return self.by_model[model]


def _route(monkeypatch, genotype_rows, poss_het_row):
    owner = NS(id=uuid.uuid4())
    male, female = uuid.uuid4(), uuid.uuid4()
    clutch = NS(id=uuid.uuid4(), pairing_id=uuid.uuid4())
    pairing = NS(id=clutch.pairing_id, male_animal_id=male, female_animal_id=female, taxon="snake")
    monkeypatch.setattr(cl, "_own_clutch_or_404", lambda *a: clutch)
    monkeypatch.setattr(cl, "_own_pairing_or_404", lambda *a: pairing)
    db = DB({
        Animal: Q(first=NS(name="Parent", common_name=None, scientific_name=None)),
        AnimalGenotype: Q(first=poss_het_row, all_=genotype_rows),
    })
    fn = inspect.unwrap(cl.get_clutch_parent_genotypes)
    return asyncio.run(fn(clutch_id=clutch.id, db=db, current_user=owner))


def test_route_returns_visual_genes_and_overlap(monkeypatch):
    res = _route(monkeypatch, _rows(("visual", "recessive", "Clown")), poss_het_row=None)
    assert [(g.gene_key, g.zygosity) for g in res.male.genotypes] == [("Clown", "hom")]
    assert res.overlapping_gene_keys == ["Clown"]
    assert res.note is None


def test_route_note_says_poss_hets_are_left_out(monkeypatch):
    res = _route(monkeypatch, _rows(("visual", "recessive", "Clown")), poss_het_row=NS(zygosity="poss_het"))
    assert res.overlapping_gene_keys == ["Clown"]
    assert "Possible-het genes are left out" in res.note

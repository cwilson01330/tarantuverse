"""Audit-2 D: source pins for the web add form and the web card-link lists.

These read the TypeScript sources (like test_taxon_lists_in_sync.py) because
the behaviour lives in the clients:

* the web add form's per-taxon starting enclosure type must match mobile's
  `defaultEnclosureType` (audit2-animals M7);
* the web add form honours `?species_id=` (care-sheet "Add to collection")
  and `?enclosure_id=` (enclosure "+ Add new animal", M12), and no longer
  falls back to a scorpion when the taxon is missing;
* TV web and HV web both list and revoke card links through the same API the
  mobile "Shared cards" screens use (audit2-hv H3).
"""
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
WEB_ADD = REPO / "apps/web/src/app/dashboard/inverts/add/page.tsx"
MOB_INVERTS = REPO / "apps/mobile/src/lib/inverts.ts"
TV_SHARING = REPO / "apps/web/src/app/dashboard/sharing/page.tsx"
HV_SHARING = REPO / "apps/web-herpetoverse/src/app/app/sharing/page.tsx"

pytestmark = pytest.mark.skipif(not WEB_ADD.is_file(), reason="client sources not present (API-only checkout)")


def _web_defaults() -> dict:
    src = WEB_ADD.read_text(encoding="utf-8")
    block = re.search(r"const DEFAULT_ENCLOSURE_TYPE: Record<InvertTaxon, EnclosureType> = \{(.*?)\}", src, re.S)
    assert block, "DEFAULT_ENCLOSURE_TYPE not found in the web add form"
    return dict(re.findall(r"(\w+):\s*'(\w+)'", block.group(1)))


def _mobile_defaults() -> dict:
    src = MOB_INVERTS.read_text(encoding="utf-8")
    block = re.search(r"export const INVERT_TAXA: Record<InvertTaxon, InvertTaxonMeta> = \{(.*?)\n\};", src, re.S)
    assert block, "INVERT_TAXA not found in the mobile registry"
    out = {}
    for key, body in re.findall(r"\n  (\w+): \{(.*?)\n  \},", block.group(1), re.S):
        m = re.search(r"defaultEnclosureType:\s*'(\w+)'", body)
        if m:
            out[key] = m.group(1)
    return out


def test_web_add_form_defaults_match_mobile():
    web, mob = _web_defaults(), _mobile_defaults()
    assert mob, "parsed no defaultEnclosureType values from the mobile registry"
    assert web == mob, f"enclosure defaults differ: web {web} vs mobile {mob}"


def test_web_add_form_reads_prefill_and_enclosure_params():
    src = WEB_ADD.read_text(encoding="utf-8")
    assert "searchParams.get('species_id')" in src
    assert "searchParams.get('enclosure_id')" in src
    assert "enclosure_id: enclosureId" in src
    assert "life_stage: lifeStage" in src
    # The old fallback filed every untyped add as a scorpion.
    assert ": 'scorpion'" not in src


@pytest.mark.parametrize("path,app", [(TV_SHARING, "tarantuverse"), (HV_SHARING, "herpetoverse")])
def test_web_sharing_pages_list_and_revoke_card_links(path, app):
    if not path.is_file():
        pytest.skip(f"{path} not present")
    src = path.read_text(encoding="utf-8")
    assert "/api/v1/card-links/`" in src, "no GET /card-links/ list call"
    assert "method: 'DELETE'" in src and "/api/v1/card-links/${encodeURIComponent(c.code)}" in src
    assert f"c.app === '{app}'" in src, "each site should show only its own app's links"

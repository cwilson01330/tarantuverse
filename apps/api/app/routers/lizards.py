"""REMOVED — see ADR-003.

The lizards router was consolidated into the unified animals router
(app/routers/animals.py) as of the anm_20260514 migration. Per-taxon
collection screens now call GET /api/v1/animals/?taxon=lizard.

This file is intentionally empty and should be `git rm`'d — kept only
because the dev sandbox couldn't delete it directly.
"""

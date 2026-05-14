"""REMOVED — see ADR-003.

The Frog model was consolidated into the unified `Animal` model
(app/models/animal.py) as of the anm_20260514 migration — frogs never
got a standalone production deployment; they go straight into the
unified table. This file is intentionally empty and should be
`git rm`'d — it's kept only because the dev sandbox couldn't delete it
directly.
"""

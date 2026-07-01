"""
merge_user_accounts.py — attach a duplicate account's sign-in to the account
that actually holds the collection, then remove the empty duplicate.

Background (2026-07-01)
-----------------------
A keeper signed in with two different providers (e.g. Apple AND Google). Because
the two providers report different emails (Apple private-relay vs Gmail), the
auto-link-on-matching-email path could not connect them, so a SECOND, empty
account was created. Their real collection lives on the PRIMARY account.

The multi-identity table `user_oauth_accounts` is already live, and the
`/oauth-login` resolver looks a user up by (provider, provider_account_id)
BEFORE falling back to email. So if we move the duplicate's OAuth identity row
onto the primary account, BOTH providers will resolve to the primary account —
the keeper can then sign in with either button and see their collection.

What this does
--------------
1. Loads SOURCE (the empty duplicate) and TARGET (the account with the data).
2. SAFETY: refuses to run if SOURCE owns any animals (inverts/tarantulas), so we
   never delete real data. (A collection-bearing duplicate needs a full data
   merge, which is intentionally out of scope here.)
3. Moves each of SOURCE's user_oauth_accounts identity rows onto TARGET, unless
   TARGET already has an identity for that provider (then the source row is
   dropped as a duplicate).
4. Deletes the now-empty SOURCE account (its dependent rows cascade).
5. Prints a before/after summary. Wrapped in a single transaction — all or
   nothing.

Idempotent: re-running after a successful merge is a no-op (SOURCE won't exist).

Run on the Render shell:
    cd apps/api
    python3 merge_user_accounts.py                 # defaults to Courtney's two accounts
    python3 merge_user_accounts.py --source <uuid> --target <uuid>
    python3 merge_user_accounts.py ... --dry-run   # report only, no writes
"""
import argparse
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models.user import User
from app.models.user_oauth_account import UserOAuthAccount
from app.models.invert import Invert
from app.models.tarantula import Tarantula

# Defaults: Courtney's accounts (2026-07-01).
#   TARGET = Apple sign-in, holds 27 animals ("Courtney Elmore")
#   SOURCE = Google sign-in, empty duplicate  ("Courtney E")
DEFAULT_TARGET = "c39ce725-24ad-45cd-a454-3c4278f36503"
DEFAULT_SOURCE = "e0edd1f7-e505-49a6-bc81-96c6ae143716"


def _animal_counts(db, user_id):
    inverts = db.query(Invert).filter(Invert.user_id == user_id).count()
    tarantulas = db.query(Tarantula).filter(Tarantula.user_id == user_id).count()
    return inverts, tarantulas


def merge(source_id: str, target_id: str, dry_run: bool = False):
    db = SessionLocal()
    try:
        source = db.query(User).filter(User.id == source_id).first()
        target = db.query(User).filter(User.id == target_id).first()

        if source is None:
            print(f"SOURCE {source_id} not found — nothing to do (already merged?).")
            return
        if target is None:
            print(f"ERROR: TARGET {target_id} not found. Aborting.")
            return
        if source.id == target.id:
            print("ERROR: source and target are the same account. Aborting.")
            return

        src_inv, src_tar = _animal_counts(db, source.id)
        tgt_inv, tgt_tar = _animal_counts(db, target.id)

        print("── Merge plan ──────────────────────────────────────────────")
        print(f"  SOURCE (remove): {source.display_name!r}  {source.email}")
        print(f"                   {source.id}  animals: {src_inv} inverts / {src_tar} tarantulas")
        print(f"  TARGET (keep):   {target.display_name!r}  {target.email}")
        print(f"                   {target.id}  animals: {tgt_inv} inverts / {tgt_tar} tarantulas")

        # SAFETY: never delete an account that holds a collection.
        if src_inv > 0 or src_tar > 0:
            print(
                "\nABORT: the SOURCE account owns animals. This script only merges an "
                "EMPTY duplicate. A collection-bearing merge needs a full data migration "
                "(reassign every user-owned table) — do that deliberately, not here."
            )
            return

        target_providers = {
            o.provider for o in db.query(UserOAuthAccount).filter(
                UserOAuthAccount.user_id == target.id
            ).all()
        }
        source_identities = db.query(UserOAuthAccount).filter(
            UserOAuthAccount.user_id == source.id
        ).all()

        moved, dropped = [], []
        for ident in source_identities:
            if ident.provider in target_providers:
                # TARGET already signs in with this provider — source row is redundant.
                dropped.append(ident.provider)
                if not dry_run:
                    db.delete(ident)
            else:
                moved.append(f"{ident.provider} ({ident.provider_email})")
                if not dry_run:
                    ident.user_id = target.id
                target_providers.add(ident.provider)

        print("\n  Identities to MOVE onto target: " + (", ".join(moved) or "(none)"))
        print("  Redundant identities to DROP:   " + (", ".join(dropped) or "(none)"))
        print("  Then DELETE the empty source account.")

        if dry_run:
            print("\n[dry-run] No changes written.")
            return

        db.delete(source)
        db.commit()
        print("\n✅ Merge complete. Both providers now resolve to the target account.")
        remaining = db.query(UserOAuthAccount).filter(
            UserOAuthAccount.user_id == target.id
        ).all()
        print("   Target now signs in with: " + ", ".join(sorted(o.provider for o in remaining)))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Merge an empty duplicate account's sign-in into the primary account.")
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="Empty duplicate account id (to remove)")
    ap.add_argument("--target", default=DEFAULT_TARGET, help="Primary account id (holds the collection)")
    ap.add_argument("--dry-run", action="store_true", help="Report the plan without writing")
    args = ap.parse_args()
    merge(args.source, args.target, dry_run=args.dry_run)

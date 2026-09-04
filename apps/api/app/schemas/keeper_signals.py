"""Keeper-consensus husbandry signals (ADR-018)."""
from typing import Optional

from pydantic import BaseModel, Field


class KeeperSignalsResponse(BaseModel):
    """What keepers on this platform actually do with a species.

    `meets_threshold` is load-bearing. When it is False every statistic is
    None and the client MUST render nothing — not a hedge, not a
    platform-wide fallback. The counts are still returned so an admin can see
    how close a species is to qualifying, but they are not for display next to
    an absent figure.
    """

    species_id: str

    meets_threshold: bool = Field(
        description=(
            "True when this species has enough independent evidence to show a "
            "figure. When False, clients render nothing."
        )
    )

    median_interval_days: Optional[int] = Field(
        default=None,
        description=(
            "Median of per-keeper median intervals between ACCEPTED feedings, "
            "in whole days. Per-keeper first so one heavily-logging account "
            "cannot set the species number alone. Null below threshold."
        ),
    )

    # Evidence always travels with the figure — a number without its sample
    # size is not shippable (ADR-018, inherited from ADR-014).
    keeper_count: int = Field(description="Distinct keepers contributing.")
    observation_count: int = Field(description="Eligible feeding intervals.")
    animal_count: int = Field(description="Distinct animals contributing.")

    # Echoed so the UI can explain the gate without hardcoding it, and so the
    # thresholds are visible in the API rather than buried in a service.
    window_days: int
    min_keepers: int
    min_observations: int

"""
SQLAlchemy ORM Models
"""
from app.models.user import User
from app.models.tarantula import Tarantula
from app.models.species import Species
from app.models.feeding_log import FeedingLog
from app.models.molt_log import MoltLog
from app.models.substrate_change import SubstrateChange
from app.models.enclosure import Enclosure
from app.models.photo import Photo
from app.models.follow import Follow
from app.models.direct_message import Conversation, DirectMessage
from app.models.forum import ForumCategory, ForumThread, ForumPost
from app.models.activity_feed import ActivityFeed
from app.models.subscription import SubscriptionPlan, UserSubscription
from app.models.promo_code import PromoCode
from app.models.notification_preferences import NotificationPreferences
from app.models.user_theme_preferences import UserThemePreferences
from app.models.pairing import Pairing
from app.models.egg_sac import EggSac
from app.models.offspring import Offspring
from app.models.user_block import UserBlock
from app.models.content_report import ContentReport
from app.models.pricing_submission import PricingSubmission
from app.models.referral_reward import ReferralReward
from app.models.user_oauth_account import UserOAuthAccount
from app.models.announcement import Announcement
from app.models.system_setting import SystemSetting
from app.models.achievement import AchievementDefinition, UserAchievement
from app.models.communal_incident import CommunalIncident
from app.models.feeder_species import FeederSpecies
from app.models.feeder_colony import FeederColony
from app.models.feeder_care_log import FeederCareLog
from app.models.waitlist import WaitlistSignup
# Herpetoverse v1 (ADR-002 parallel taxon tables) — reptile_species MUST be
# imported before snake so SQLAlchemy sees the target of the FK.
from app.models.reptile_species import ReptileSpecies
from app.models.snake import Snake
from app.models.lizard import Lizard
from app.models.shed_log import ShedLog
from app.models.weight_log import WeightLog
from app.models.gene import Gene
from app.models.animal_genotype import AnimalGenotype
# Reptile breeding records — pairings must be imported before clutches +
# offspring so the FKs resolve at registration time.
from app.models.reptile_pairing import (
    ReptilePairing,
    ReptilePairingType,
    ReptilePairingOutcome,
)
from app.models.clutch import Clutch
from app.models.reptile_offspring import (
    ReptileOffspring,
    ReptileOffspringStatus,
)

__all__ = [
    "User",
    "Tarantula",
    "Species",
    "FeedingLog",
    "MoltLog",
    "SubstrateChange",
    "Enclosure",
    "Photo",
    "Follow",
    "Conversation",
    "DirectMessage",
    "ForumCategory",
    "ForumThread",
    "ForumPost",
    "ActivityFeed",
    "SubscriptionPlan",
    "UserSubscription",
    "PromoCode",
    "NotificationPreferences",
    "UserThemePreferences",
    "Pairing",
    "EggSac",
    "Offspring",
    "UserBlock",
    "ContentReport",
    "PricingSubmission",
    "ReferralReward",
    "UserOAuthAccount",
    "Announcement",
    "SystemSetting",
    "AchievementDefinition",
    "UserAchievement",
    "CommunalIncident",
    "FeederSpecies",
    "FeederColony",
    "FeederCareLog",
    "WaitlistSignup",
    "ReptileSpecies",
    "Snake",
    "Lizard",
    "ShedLog",
    "WeightLog",
    "Gene",
    "AnimalGenotype",
    "ReptilePairing",
    "ReptilePairingType",
    "ReptilePairingOutcome",
    "Clutch",
    "ReptileOffspring",
    "ReptileOffspringStatus",
]

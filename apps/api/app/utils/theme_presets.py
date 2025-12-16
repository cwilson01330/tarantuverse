"""
Theme Presets for Interface Skinning Feature

Species-inspired and habitat-themed color presets for customizing the Tarantuverse interface.
"""

from typing import Dict, Any, List

THEME_PRESETS: Dict[str, Dict[str, Any]] = {
    # ============================================
    # FREE PRESETS (4)
    # ============================================
    'default': {
        'id': 'default',
        'name': 'Tarantuverse',
        'description': 'The classic Tarantuverse look with electric blue and neon pink',
        'primary': '#0066FF',
        'secondary': '#FF0099',
        'accent': '#3385FF',
        'is_free': True,
        'category': 'default',
    },
    'brachypelma': {
        'id': 'brachypelma',
        'name': 'Red Knee',
        'description': 'Inspired by the iconic Brachypelma hamorii',
        'species': 'Brachypelma hamorii',
        'primary': '#DC2626',
        'secondary': '#1F1F1F',
        'accent': '#EF4444',
        'is_free': True,
        'category': 'species',
    },
    'grammostola': {
        'id': 'grammostola',
        'name': 'Rosea Rose',
        'description': 'Soft dusty rose inspired by the Chilean Rose',
        'species': 'Grammostola rosea',
        'primary': '#F472B6',
        'secondary': '#78716C',
        'accent': '#F9A8D4',
        'is_free': True,
        'category': 'species',
    },
    'terrestrial': {
        'id': 'terrestrial',
        'name': 'Earth Tones',
        'description': 'Warm earthy browns for terrestrial lovers',
        'primary': '#8B4513',
        'secondary': '#2D5016',
        'accent': '#A0522D',
        'is_free': True,
        'category': 'habitat',
    },

    # ============================================
    # PREMIUM PRESETS (7)
    # ============================================
    'gbb': {
        'id': 'gbb',
        'name': 'GBB Blue',
        'description': 'Vibrant blue and orange from the stunning Greenbottle Blue',
        'species': 'Chromatopelma cyaneopubescens',
        'primary': '#0099FF',
        'secondary': '#FF6600',
        'accent': '#00CCFF',
        'is_free': False,
        'category': 'species',
    },
    'obt': {
        'id': 'obt',
        'name': 'OBT Orange',
        'description': 'Fiery orange inspired by the Orange Baboon Tarantula',
        'species': 'Pterinochilus murinus',
        'primary': '#FF6600',
        'secondary': '#1A1A1A',
        'accent': '#FF9933',
        'is_free': False,
        'category': 'species',
    },
    'poecilotheria': {
        'id': 'poecilotheria',
        'name': 'Poeci Yellow',
        'description': 'Bold warning colors from the Ornamental genus',
        'species': 'Poecilotheria sp.',
        'primary': '#FFD700',
        'secondary': '#1A1A1A',
        'accent': '#FFED4A',
        'is_free': False,
        'category': 'species',
    },
    'avicularia': {
        'id': 'avicularia',
        'name': 'Pink Toe',
        'description': 'Pink and purple from the beloved Avicularia',
        'species': 'Avicularia sp.',
        'primary': '#FF69B4',
        'secondary': '#6B21A8',
        'accent': '#FF8DC7',
        'is_free': False,
        'category': 'species',
    },
    'monocentropus': {
        'id': 'monocentropus',
        'name': 'Balfouri Blue',
        'description': 'Stunning blue and purple from the Socotra Island Blue',
        'species': 'Monocentropus balfouri',
        'primary': '#3B82F6',
        'secondary': '#A855F7',
        'accent': '#60A5FA',
        'is_free': False,
        'category': 'species',
    },
    'arboreal': {
        'id': 'arboreal',
        'name': 'Forest',
        'description': 'Lush greens for arboreal enthusiasts',
        'primary': '#16A34A',
        'secondary': '#065F46',
        'accent': '#22C55E',
        'is_free': False,
        'category': 'habitat',
    },
    'fossorial': {
        'id': 'fossorial',
        'name': 'Burrow',
        'description': 'Deep earth tones for fossorial species lovers',
        'primary': '#44403C',
        'secondary': '#292524',
        'accent': '#57534E',
        'is_free': False,
        'category': 'habitat',
    },
}


def get_preset(preset_id: str) -> Dict[str, Any] | None:
    """Get a specific preset by ID."""
    return THEME_PRESETS.get(preset_id)


def get_all_presets() -> List[Dict[str, Any]]:
    """Get all presets as a list."""
    return list(THEME_PRESETS.values())


def get_free_presets() -> List[Dict[str, Any]]:
    """Get only free presets."""
    return [p for p in THEME_PRESETS.values() if p['is_free']]


def get_premium_presets() -> List[Dict[str, Any]]:
    """Get only premium presets."""
    return [p for p in THEME_PRESETS.values() if not p['is_free']]


def get_presets_by_category(category: str) -> List[Dict[str, Any]]:
    """Get presets by category (species, habitat, default)."""
    return [p for p in THEME_PRESETS.values() if p.get('category') == category]


def is_preset_free(preset_id: str) -> bool:
    """Check if a preset is free."""
    preset = THEME_PRESETS.get(preset_id)
    return preset['is_free'] if preset else False


def get_preset_colors(preset_id: str) -> Dict[str, str] | None:
    """Get just the color values from a preset."""
    preset = THEME_PRESETS.get(preset_id)
    if not preset:
        return None
    return {
        'primary': preset['primary'],
        'secondary': preset['secondary'],
        'accent': preset['accent'],
    }


# Default colors (used when no preference is set)
DEFAULT_COLORS = {
    'primary': '#0066FF',
    'secondary': '#FF0099',
    'accent': '#3385FF',
}

"""
Shared rate limiter instance.

Import `limiter` here and in main.py so both share the same object.
Attach it to `app.state.limiter` in main.py and register the 429 handler.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
